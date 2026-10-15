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
        corpus = get_or_prepare_corpus(self.web_path, self.bsb_dir)

        # 1. Resolve chunks: check explicit dir, or auto-match upstream chunk lock, or generate
        floor = int(self.config["floor"])
        ceiling = int(self.config["ceiling"])
        overlap = int(self.config.get("overlap", 0))
        render_strategy = self.config.get("render_strategy", "heading_and_text")

        chunk_dir_override = self.config.get("chunk_run_dir")
        chunk_run_dir = Path(chunk_dir_override) if chunk_dir_override else None

        if "strategy" not in self.config:
            raise KeyError("Missing required 'strategy' parameter in embed_corpus configuration")
        strategy_name = str(self.config["strategy"])
        if not chunk_run_dir:
            chunk_outputs = REPO / "ingest" / "analysis" / "chunking_strategy" / "outputs"
            chunk_criteria = {
                "strategy": strategy_name,
                "ceiling": ceiling,
                "overlap": overlap,
            }
            if strategy_name == "adaptive":
                chunk_criteria["floor"] = floor
            if "include_overlap_heading" in self.config:
                chunk_criteria["include_overlap_heading"] = bool(self.config["include_overlap_heading"])
            chunk_run_dir = resolve_matching_artifacts(chunk_outputs, chunk_criteria)

        chunks: list[Passage]
        upstream_lock_meta: dict[str, Any] = {}
        if chunk_run_dir and (chunk_run_dir / "chunks.json").exists():
            logger.info("Found matching upstream chunk artifact at %s", chunk_run_dir)
            if (chunk_run_dir / "config.lock.yaml").exists():
                upstream_lock_meta = read_lock_file(chunk_run_dir / "config.lock.yaml")
            raw_meta = json.loads((chunk_run_dir / "chunks.json").read_text(encoding="utf-8"))
            chunks = []
            for item in raw_meta:
                book = item["book"]
                if "start" in item:
                    ch_s, v_s = item["start"]
                    ch_e, v_e = item["end"]
                elif "start_addr" in item:
                    ch_s, v_s = item["start_addr"]
                    ch_e, v_e = item["end_addr"]
                else:
                    ch_s, v_s = item["chapter"], item["verse"]
                    ch_e, v_e = ch_s, v_s + item["verse_count"] - 1

                start_idx = corpus.address_index[(book, ch_s, v_s)]
                end_idx = start_idx + item["verse_count"]

                sections = []
                headings_raw = item.get("headings", [])
                if headings_raw and isinstance(headings_raw[0], (list, tuple)):
                    for ch, v, h in headings_raw:
                        sec_idx = corpus.address_index.get((book, ch, v), start_idx)
                        sections.append((sec_idx, h))
                elif "sections" in item:
                    for s in item["sections"]:
                        sec_idx = corpus.address_index.get((book, s["chapter"], s["verse"]), start_idx)
                        sections.append((sec_idx, s["heading"]))
                elif headings_raw and isinstance(headings_raw[0], str):
                    sections = [(start_idx, h) for h in headings_raw]

                end_addr = corpus.ordered_verses[end_idx - 1][0] if end_idx > start_idx else (book, ch_e, v_e)
                chunks.append(
                    Passage(
                        book=book,
                        start=(ch_s, v_s),
                        end=(end_addr[1], end_addr[2]),
                        start_idx=start_idx,
                        end_idx=end_idx,
                        sections=tuple(sections),
                    )
                )
        else:
            logger.info("No matching chunk artifact found; generating chunks in-line with strategy '%s'.", strategy_name)
            chunk_cfg = dict(self.config)
            chunk_cfg.pop("strategy", None)
            chunker = get_chunker(
                strategy_name,
                ordered_verses=corpus.ordered_verses,
                address_index=corpus.address_index,
                **chunk_cfg,
            )
            chunks = chunker.chunk(corpus.pericopes)

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
        ordered_verses = prepared.get("ordered_verses", ())
        chunks_meta = []
        for c in result["chunks"]:
            headings_meta = []
            for sec_idx, sec_heading in c.sections:
                if sec_heading:
                    addr = ordered_verses[sec_idx][0] if ordered_verses and sec_idx < len(ordered_verses) else None
                    ch = addr[1] if addr else c.chapter
                    v = addr[2] if addr else c.verse
                    headings_meta.append([ch, v, sec_heading])
            chunks_meta.append({
                "book": c.book,
                "start": c.start,
                "end": c.end,
                "verse_count": c.verse_count,
                "headings": headings_meta,
            })
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


JOB_CLASS = AnalysisJobEmbedCorpus
