import logging
from pathlib import Path
from typing import Any

import numpy as np

from analysis.job import AnalysisJobBase
from analysis.quantize_corpus.plots import (
    compute_quantization_diagnostics,
    generate_quantization_plots,
)
from bibleit_ingest.artifacts import (
    load_chunks_artifact,
    read_lock_file,
    resolve_matching_artifacts,
    save_chunks_artifact,
    write_lock_file,
)
from bibleit_ingest.constants import EMBED_CORPUS_OUTPUTS
from bibleit_ingest.types import ChunkConfig
from rag_core.quantization import BaseQuantizer, Int8Quantizer, NoOpQuantizer

logger = logging.getLogger(__name__)


def get_quantizer(name: str) -> BaseQuantizer:
    if name == "int8":
        return Int8Quantizer()
    if name in ("float32", "none"):
        return NoOpQuantizer()
    raise ValueError(f"Unsupported quantizer: {name}")


class AnalysisJobQuantizeCorpus(AnalysisJobBase):
    def _make_slug(self) -> str:
        chunk_cfg = ChunkConfig.from_mapping(self.config)
        model = str(self.config.get("embedding_model", "nomic"))
        model_short = "nomic" if "nomic" in model else model.split("/")[-1]
        quant_name = str(self.config.get("quantizer", "int8"))
        return f"{chunk_cfg.slug}_{model_short}_{quant_name}"

    def on_prepare(self) -> dict[str, Any]:
        chunk_cfg = ChunkConfig.from_mapping(self.config)
        emb_dir_override = self.config.get("embedding_run_dir")
        emb_run_dir = Path(emb_dir_override) if emb_dir_override else resolve_matching_artifacts(EMBED_CORPUS_OUTPUTS, chunk_cfg.content_hash)

        if not emb_run_dir or not (emb_run_dir / "embeddings.npy").exists():
            target = emb_run_dir or f"{EMBED_CORPUS_OUTPUTS} for hash {chunk_cfg.content_hash}"
            raise FileNotFoundError(f"No upstream embeddings found in {target}")

        upstream_lock = read_lock_file(emb_run_dir / "config.lock.yaml") if (emb_run_dir / "config.lock.yaml").exists() else {}
        chunks = load_chunks_artifact(emb_run_dir / "chunks.json")
        embeddings = np.load(emb_run_dir / "embeddings.npy")

        return {
            "chunks": chunks,
            "embeddings": embeddings,
            "quantizer": get_quantizer(str(self.config.get("quantizer", "int8"))),
            "upstream_lock": upstream_lock,
        }

    def on_execute(self, prepared: dict[str, Any]) -> dict[str, Any]:
        matrix = prepared["embeddings"]
        quantizer: BaseQuantizer = prepared["quantizer"]

        # Unit-normalize so dot product equals cosine distance at query time
        if self.config.get("normalize", True):
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            matrix = (matrix / np.maximum(norms, 1e-12)).astype(np.float32)

        q_matrix, quant_meta = quantizer.quantize(matrix)
        dequantized = quantizer.dequantize(q_matrix, **quant_meta)
        scales = quant_meta.get("scales", np.ones(matrix.shape[0], dtype=np.float32))

        metrics, plot_data = compute_quantization_diagnostics(matrix, dequantized, q_matrix, scales)
        return {
            "chunks": prepared["chunks"],
            "q_matrix": q_matrix,
            "quant_meta": quant_meta,
            "metrics": metrics,
            "plot_data": plot_data,
            "upstream_lock": prepared["upstream_lock"],
        }

    def on_finalize(self, prepared: dict[str, Any], result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)

        plot_paths = generate_quantization_plots(result["plot_data"], self.run_dir)
        if self.tracker is not None:
            for name, path in plot_paths.items():
                self.tracker.track_artifact(path, name=name, type="plot")

        q_matrix = result["q_matrix"]
        quant_meta = result["quant_meta"]
        quantizer_name = prepared["quantizer"].name

        # Save compressed matrix and scaling factors
        ext = "i8.bin" if quantizer_name == "int8" else f"{quantizer_name}.bin"
        (self.run_dir / f"embeddings.{ext}").write_bytes(q_matrix.tobytes())
        if "scales" in quant_meta:
            (self.run_dir / "scales.f32.bin").write_bytes(quant_meta["scales"].astype(np.float32).tobytes())

        save_chunks_artifact(self.run_dir / "chunks.json", result["chunks"])

        chunk_cfg = ChunkConfig.from_mapping(self.config)
        lock_data = {
            "stage": "quantization",
            "hash": chunk_cfg.content_hash,
            "parameters": {
                **chunk_cfg.canonical_dict,
                "embedding_model": str(self.config.get("embedding_model", "nomic-ai/nomic-embed-text-v1.5")),
                "quantizer": quantizer_name,
                "normalize": bool(self.config.get("normalize", True)),
            },
            "metrics": result["metrics"],
            "output": {
                "shape": list(q_matrix.shape),
                "dtype": str(q_matrix.dtype),
                "total_chunks": len(result["chunks"]),
            },
            "upstream": result.get("upstream_lock", {}),
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        logger.info("Saved quantization artifact to %s", self.run_dir)

        for key in ("chunks", "q_matrix", "plot_data", "quant_meta"):
            result.pop(key, None)


JOB_CLASS = AnalysisJobQuantizeCorpus
