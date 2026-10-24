import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from analysis.embed_corpus.plots import (
    compute_embedding_diagnostics,
    generate_embedding_plots,
)
from analysis.job import AnalysisJobBase
from bibleit_ingest.artifacts import (
    load_chunks_artifact,
    read_lock_file,
    resolve_matching_artifacts,
    save_chunks_artifact,
    write_lock_file,
)
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, REPO
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.renderers import get_renderer
from bibleit_ingest.types import ChunkConfig

logger = logging.getLogger(__name__)


class AnalysisJobEmbedCorpus(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def _make_slug(self) -> str:
        chunk_cfg = ChunkConfig(**self.config["chunk"])
        model = str(self.config.get("embedding_model", "nomic"))
        model_short = "nomic" if "nomic" in model else model.split("/")[-1]
        return f"{chunk_cfg.slug}_{model_short}"

    def on_prepare(self) -> dict:
        corpus, _ = get_or_prepare_corpus(self.web_path, self.bsb_dir)
        chunk_cfg = ChunkConfig(**self.config["chunk"])

        # chunk_dir_override: Optional path supplied in config to bypass search and use an explicit chunk artifact.
        chunk_dir_override = self.config.get("chunk_run_dir")
        if chunk_dir_override:
            chunk_run_dir = Path(chunk_dir_override)
            if not chunk_run_dir.exists():
                raise FileNotFoundError(f"Specified chunk_run_dir does not exist: {chunk_dir_override}")
        else:
            chunk_run_dir = None

        # chunk_outputs: Directory holding upstream chunk runs to search across by content hash.
        chunk_outputs = REPO / "ingest" / "analysis" / "chunking_strategy" / "outputs"

        if not chunk_run_dir:
            chunk_run_dir = resolve_matching_artifacts(chunk_outputs, chunk_cfg.content_hash)

        if not chunk_run_dir or not (chunk_run_dir / "chunks.json").exists():
            target_desc = f"{chunk_run_dir}" if chunk_run_dir else f"{chunk_outputs} for hash: {chunk_cfg.content_hash}"
            raise FileNotFoundError(f"No matching chunk artifact (chunks.json) found in {target_desc}")

        logger.info("Found matching upstream chunk artifact at %s", chunk_run_dir)
        upstream_lock_meta: dict[str, Any] = {}
        if (chunk_run_dir / "config.lock.yaml").exists():
            upstream_lock_meta = read_lock_file(chunk_run_dir / "config.lock.yaml")
        chunks = load_chunks_artifact(chunk_run_dir / "chunks.json")

        # 2. Prepare Embedder
        embedding_model = str(self.config["embedding_model"])
        threads = int(self.config.get("threads", 4))
        embedder = Embedder(
            model_name=embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
            threads=threads,
        )

        return {
            "chunks": chunks,
            "corpus": corpus,
            "render_strategy": chunk_cfg.render_strategy,
            "embedder": embedder,
            "upstream_lock": upstream_lock_meta,
        }

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        chunks = prepared["chunks"]
        render_strategy = prepared["render_strategy"]
        embedder = prepared["embedder"]
        batch_size = int(self.config.get("batch_size", 16))
        parallel_raw = self.config.get("parallel")
        parallel = int(parallel_raw) if parallel_raw is not None else None

        renderer = get_renderer(render_strategy, corpus=prepared["corpus"])
        texts = [renderer.render(c) for c in chunks]
        total = len(chunks)

        logger.info("Embedding %d chunks with '%s' (batch_size=%d, parallel=%s)...", total, embedder.model_name, batch_size, parallel)
        with Timer(text=f"Embedded {total} chunks in {{:.1f}}s", logger=logger.info):
            vectors = list(
                tqdm(
                    embedder.embed_documents(texts, batch_size=batch_size, parallel=parallel),
                    total=total,
                    desc=f"embedding chunks [{render_strategy}]",
                    unit="chunk",
                )
            )

        matrix = np.array(vectors)
        metrics, plot_data = compute_embedding_diagnostics(matrix, chunks)

        return {
            "chunks": chunks,
            "embeddings": matrix,
            "metrics": metrics,
            "plot_data": plot_data,
            "upstream_lock": prepared["upstream_lock"],
        }

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)

        plot_paths = generate_embedding_plots(result["plot_data"], self.run_dir)
        if self.tracker is not None:
            for name, path in plot_paths.items():
                self.tracker.track_artifact(path, name=name, type="plot")

        np.save(self.run_dir / "embeddings.npy", result["embeddings"])
        save_chunks_artifact(self.run_dir / "chunks.json", result["chunks"])

        matrix = result["embeddings"]
        chunk_cfg = ChunkConfig(**self.config["chunk"])
        lock_data = {
            "stage": "embedding",
            "hash": chunk_cfg.content_hash,
            "parameters": {
                **chunk_cfg.canonical_dict,
                "embedding_model": str(self.config["embedding_model"]),
            },
            "output": {
                "shape": list(matrix.shape),
                "dtype": str(matrix.dtype),
                "total_chunks": len(result["chunks"]),
            },
            "upstream": result.get("upstream_lock", {}),
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        logger.info("Saved embedding artifact with lock to %s", self.run_dir)

        # Prune heavy in-memory data so logs and crucible output remain concise
        for key in ("chunks", "embeddings", "plot_data", "texts"):
            result.pop(key, None)


JOB_CLASS = AnalysisJobEmbedCorpus
