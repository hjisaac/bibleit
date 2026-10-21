import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from analysis.job import AnalysisJobBase
from bibleit_ingest.artifacts import read_lock_file, resolve_matching_artifacts, write_lock_file
from bibleit_ingest.chunking import get_chunker
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, REPO
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.renderers import get_renderer
from bibleit_ingest.types import Passage

logger = logging.getLogger(__name__)


def _compute_vector_health(matrix: np.ndarray) -> dict[str, Any]:
    norms = np.linalg.norm(matrix, axis=1)
    # Sample up to 500 random pairs to estimate representation spread / anisotropy
    n = matrix.shape[0]
    num_samples = min(500, n * (n - 1) // 2) if n > 1 else 0
    cos_sims: list[float] = []
    if num_samples > 0:
        rng = np.random.default_rng(seed=42)
        idx1 = rng.integers(0, n, size=num_samples)
        idx2 = rng.integers(0, n, size=num_samples)
        # Avoid self-pairs
        mask = idx1 != idx2
        idx1, idx2 = idx1[mask], idx2[mask]
        normed = matrix / np.maximum(norms[:, None], 1e-12)
        sims = np.sum(normed[idx1] * normed[idx2], axis=1)
        cos_sims = [float(s) for s in sims]

    return {
        "norms_mean": round(float(np.mean(norms)), 4),
        "norms_std": round(float(np.std(norms)), 4),
        "norms_min": round(float(np.min(norms)), 4),
        "norms_max": round(float(np.max(norms)), 4),
        "pair_sim_mean": round(float(np.mean(cos_sims)), 4) if cos_sims else 0.0,
        "pair_sim_std": round(float(np.std(cos_sims)), 4) if cos_sims else 0.0,
        "pair_sim_max": round(float(np.max(cos_sims)), 4) if cos_sims else 0.0,
    }


class AnalysisJobEmbedCorpus(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def _make_slug(self) -> str:
        f = self.config.get("floor", 5)
        c = self.config.get("ceiling", 30)
        model = str(self.config.get("embedding_model", "nomic"))
        model_short = "nomic" if "nomic" in model else model.split("/")[-1]
        return f"f{f}_c{c}_{model_short}"

    def on_prepare(self) -> dict:
        corpus, pericopes = get_or_prepare_corpus(self.web_path, self.bsb_dir)

        # 1. Resolve chunks: check explicit dir, or auto-match upstream chunk lock, or generate
        floor = self.config.get("floor")
        ceiling = int(self.config["ceiling"])
        overlap = int(self.config.get("overlap", 0))
        render_strategy = self.config.get("render_strategy", "heading_and_text")

        # chunk_dir_override: Optional path supplied in config to bypass search and use an explicit chunk artifact.
        chunk_dir_override = self.config.get("chunk_run_dir")
        if chunk_dir_override:
            chunk_run_dir = Path(chunk_dir_override)
            if not chunk_run_dir.exists():
                raise FileNotFoundError(f"Specified chunk_run_dir does not exist: {chunk_dir_override}")
        else:
            chunk_run_dir = None

        if "strategy" not in self.config:
            raise KeyError("Missing required 'strategy' parameter in embed_corpus configuration")
        strategy_name = str(self.config["strategy"])

        # chunk_outputs: Directory holding upstream chunk runs to search across.
        # chunk_criteria: Hyperparameter filters that upstream config.lock.yaml must match exactly.
        chunk_outputs = REPO / "ingest" / "analysis" / "chunking_strategy" / "outputs"
        chunk_criteria: dict[str, Any] = {
            "strategy": strategy_name,
            "ceiling": ceiling,
            "overlap": overlap,
            "render_strategy": render_strategy,
        }
        if strategy_name == "adaptive" and floor is not None:
            chunk_criteria["floor"] = int(floor)
        if "include_overlap_heading" in self.config:
            chunk_criteria["include_overlap_heading"] = bool(self.config["include_overlap_heading"])

        if not chunk_run_dir:
            chunk_run_dir = resolve_matching_artifacts(chunk_outputs, chunk_criteria)

        if not chunk_run_dir or not (chunk_run_dir / "chunks.json").exists():
            target_desc = f"{chunk_run_dir}" if chunk_run_dir else f"{chunk_outputs} for criteria: {chunk_criteria}"
            raise FileNotFoundError(f"No matching chunk artifact (chunks.json) found in {target_desc}")

        logger.info("Found matching upstream chunk artifact at %s", chunk_run_dir)
        upstream_lock_meta: dict[str, Any] = {}
        if (chunk_run_dir / "config.lock.yaml").exists():
            upstream_lock_meta = read_lock_file(chunk_run_dir / "config.lock.yaml")
        raw_meta = json.loads((chunk_run_dir / "chunks.json").read_text(encoding="utf-8"))
        chunks = [
            Passage(
                book=item["book"],
                start=(item["start"][0], item["start"][1]),
                end=(item["end"][0], item["end"][1]),
                headings=tuple((int(ch), int(v), str(h)) for ch, v, h in item.get("headings", [])),
            )
            for item in raw_meta
        ]

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
            "render_strategy": render_strategy,
            "embedder": embedder,
            "upstream_lock": upstream_lock_meta,
        }

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        chunks = prepared["chunks"]
        render_strategy = prepared["render_strategy"]
        embedder = prepared["embedder"]
        batch_size = int(self.config.get("batch_size", 16))

        renderer = get_renderer(render_strategy, corpus=prepared["corpus"])
        texts = [renderer.render(c) for c in chunks]
        total = len(chunks)

        logger.info("Embedding %d chunks with '%s' (batch_size=%d)...", total, embedder.model_name, batch_size)
        with Timer(text=f"Embedded {total} chunks in {{:.1f}}s", logger=logger.info):
            vectors = list(
                tqdm(
                    embedder.embed_documents(texts, batch_size=batch_size),
                    total=total,
                    desc=f"embedding chunks [{render_strategy}]",
                    unit="chunk",
                )
            )

        matrix = np.array(vectors)
        health_metrics = _compute_vector_health(matrix)

        # Note: Deployment quantization metrics (Int8 fidelity, size) commented out for now.

        return {
            "chunks": chunks,
            "embeddings": matrix,
            "metrics": health_metrics,
            "upstream_lock": prepared["upstream_lock"],
        }

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)

        # 1. Save embeddings matrix
        npy_path = self.run_dir / "embeddings.npy"
        np.save(npy_path, result["embeddings"])

        # 2. Save chunks metadata
        chunks_meta = [
            {
                "id": idx,
                "book": c.book,
                "start": list(c.start),
                "end": list(c.end),
                "headings": [list(h) for h in c.headings],
            }
            for idx, c in enumerate(result["chunks"])
        ]
        chunks_path = self.run_dir / "chunks.json"
        chunks_path.write_text(json.dumps(chunks_meta, indent=2), encoding="utf-8")

        # 3. Save read-only lock file
        matrix = result["embeddings"]
        params = {
            "strategy": str(self.config["strategy"]),
            "ceiling": int(self.config["ceiling"]),
            "overlap": int(self.config.get("overlap", 0)),
            "render_strategy": self.config.get("render_strategy", "heading_and_text"),
            "embedding_model": str(self.config["embedding_model"]),
        }
        if str(self.config["strategy"]) == "adaptive" and "floor" in self.config:
            params["floor"] = int(self.config["floor"])
        if "include_overlap_heading" in self.config:
            params["include_overlap_heading"] = bool(self.config["include_overlap_heading"])

        lock_data = {
            "stage": "embedding",
            "parameters": params,
            "output": {
                "shape": list(matrix.shape),
                "dtype": str(matrix.dtype),
                "total_chunks": len(result["chunks"]),
            },
            "upstream": result.get("upstream_lock", {}),
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        logger.info("Saved embedding artifact with lock to %s", self.run_dir)


JOB_CLASS = AnalysisJobEmbedCorpus
