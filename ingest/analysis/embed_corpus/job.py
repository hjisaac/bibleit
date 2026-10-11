import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from analysis.job import AnalysisJobBase
from bibleit_ingest.artifacts import find_matching_artifact, read_lock_file, write_lock_file
from bibleit_ingest.chunking import AdaptiveWindowChunker
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, REPO
from bibleit_ingest.embedding import FastEmbedder, embed_documents
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

    def on_prepare(self) -> dict:
        corpus = get_or_prepare_corpus(self.web_path, self.bsb_dir)

        # 1. Resolve chunks: check explicit dir, or auto-match upstream chunk lock, or generate
        floor = int(self.config["floor"])
        ceiling = int(self.config["ceiling"])
        overlap = int(self.config.get("overlap", 0))
        render_strategy = self.config.get("render_strategy", "heading_and_text")

        chunk_dir_override = self.config.get("chunk_run_dir")
        chunk_run_dir = Path(chunk_dir_override) if chunk_dir_override else None

        if not chunk_run_dir:
            chunk_outputs = REPO / "ingest" / "analysis" / "chunking_strategy" / "outputs"
            chunk_criteria = {"floor": floor, "ceiling": ceiling, "overlap": overlap}
            chunk_run_dir = find_matching_artifact(chunk_outputs, chunk_criteria)

        chunks: list[Passage]
        upstream_lock_meta: dict[str, Any] = {}
        if chunk_run_dir and (chunk_run_dir / "chunks.json").exists():
            logger.info("Found matching upstream chunk artifact at %s", chunk_run_dir)
            if (chunk_run_dir / "config.lock.yaml").exists():
                upstream_lock_meta = read_lock_file(chunk_run_dir / "config.lock.yaml")
            raw_meta = json.loads((chunk_run_dir / "chunks.json").read_text(encoding="utf-8"))
            chunks = []
            for item in raw_meta:
                start_idx = corpus.address_index[(item["book"], item["chapter"], item["verse"])]
                chunks.append(
                    Passage(
                        book=item["book"],
                        start_idx=start_idx,
                        end_idx=start_idx + item["verse_count"],
                        headings=tuple(item["headings"]),
                    )
                )
        else:
            logger.info("No matching chunk artifact found; generating chunks in-line.")
            chunker = AdaptiveWindowChunker(
                floor=floor,
                ceiling=ceiling,
                overlap=overlap,
                ordered_verses=corpus.ordered_verses,
                address_index=corpus.address_index,
            )
            chunks = chunker.chunk(corpus.pericopes)

        # 2. Prepare Embedder
        embedding_model = str(self.config["embedding_model"])
        threads = int(self.config.get("threads", 4))
        embedder = FastEmbedder(
            model_name=embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
            threads=threads,
        )

        return {
            "chunks": chunks,
            "ordered_verses": corpus.ordered_verses,
            "render_strategy": render_strategy,
            "embedder": embedder,
            "upstream_lock": upstream_lock_meta,
        }

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        chunks = prepared["chunks"]
        render_strategy = prepared["render_strategy"]
        embedder = prepared["embedder"]
        batch_size = int(self.config.get("batch_size", 16))

        renderer = get_renderer(render_strategy, ordered_verses=prepared["ordered_verses"])
        texts = [renderer.render(c) for c in chunks]
        total = len(chunks)

        logger.info("Embedding %d chunks with '%s' (batch_size=%d)...", total, embedder.model_name, batch_size)
        with Timer(text=f"Embedded {total} chunks in {{:.1f}}s", logger=logger.info):
            vectors = list(
                tqdm(
                    embed_documents(embedder, texts, batch_size=batch_size),
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
                "book": c.book,
                "chapter": c.chapter,
                "verse": c.verse,
                "headings": list(c.headings),
                "verse_count": c.verse_count,
            }
            for c in result["chunks"]
        ]
        chunks_path = self.run_dir / "chunks.json"
        chunks_path.write_text(json.dumps(chunks_meta, indent=2), encoding="utf-8")

        # 3. Save read-only lock file
        matrix = result["embeddings"]
        lock_data = {
            "stage": "embedding",
            "parameters": {
                "floor": int(self.config["floor"]),
                "ceiling": int(self.config["ceiling"]),
                "overlap": int(self.config.get("overlap", 0)),
                "render_strategy": self.config.get("render_strategy", "heading_and_text"),
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


Job = AnalysisJobEmbedCorpus
JOB_CLASS = AnalysisJobEmbedCorpus
