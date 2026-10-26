import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from bibleit_ingest.artifacts import (
    load_chunks_artifact,
    read_lock_file,
    resolve_matching_artifacts,
    write_lock_file,
)
from bibleit_ingest.constants import (
    BSB_DIR,
    FASTEMBED_CACHE_DIR,
    REPO,
    EmbeddingModel,
)
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.helpers import trigger_retrieval_eval
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.report import format_passage, generate_retrieval_report
from bibleit_ingest.types import ChunkConfig
from eval.job import EvalJobBase
from eval.question_to_passage.plots import generate_retrieval_plots

logger = logging.getLogger(__name__)


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "web_path",
    )

    def _make_slug(self) -> str:
        k = self.config.get("k", 1)
        chunk_cfg = ChunkConfig.from_mapping(self.config)
        model = str(self.config.get("embedding_model", "nomic"))
        quant_tag = "_i8" if self.config.get("quantized", False) else ""
        return f"k{k}_{chunk_cfg.slug}_{model_short}{quant_tag}"

    def on_start(self) -> None:
        super().on_start()
        logger.info("=== Starting run [%s] ===", self.run_id)

    def on_prepare(self) -> dict:
        k = int(self.config.get("k", 1))
        chunk_cfg = ChunkConfig.from_mapping(self.config)
        embedding_model = EmbeddingModel(self.config["embedding_model"])
        self.config["chunk_source_model"] = str(embedding_model)

        corpus, _ = get_or_prepare_corpus(self.web_path, BSB_DIR)

        # 1. Resolve artifact (quantized if requested, else raw embed_corpus)
        use_quantized = bool(self.config.get("quantized", False))
        upstream_lock_meta: dict[str, Any] = {}

        if use_quantized:
            quant_outputs = REPO / "ingest" / "analysis" / "quantize_corpus" / "outputs"
            quant_dir_override = self.config.get("quantize_artifact_dir")
            quant_run_dir = Path(quant_dir_override) if quant_dir_override else resolve_matching_artifacts(quant_outputs, chunk_cfg.content_hash)

            if not quant_run_dir or not (quant_run_dir / "embeddings.i8.bin").exists() or not (quant_run_dir / "chunks.json").exists():
                target_desc = f"{quant_run_dir}" if quant_run_dir else f"{quant_outputs} for hash: {chunk_cfg.content_hash}"
                raise FileNotFoundError(f"No matching quantization artifact found in {target_desc}")

            logger.info("Found matching upstream quantization artifact at %s", quant_run_dir)
            if (quant_run_dir / "config.lock.yaml").exists():
                upstream_lock_meta = read_lock_file(quant_run_dir / "config.lock.yaml")
            chunks = load_chunks_artifact(quant_run_dir / "chunks.json")
            dim = int(upstream_lock_meta.get("output", {}).get("shape", [len(chunks), 768])[1])
            q_data = np.fromfile(quant_run_dir / "embeddings.i8.bin", dtype=np.int8).reshape(len(chunks), dim)
            scales = np.fromfile(quant_run_dir / "scales.f32.bin", dtype=np.float32)
            chunk_embeddings = (q_data.astype(np.float32) * scales[:, None])
        else:
            emb_dir_override = self.config.get("embedding_artifact_dir")
            if emb_dir_override:
                emb_run_dir = Path(emb_dir_override)
                if not emb_run_dir.exists():
                    raise FileNotFoundError(f"Specified embedding_artifact_dir does not exist: {emb_dir_override}")
            else:
                emb_run_dir = None

            emb_outputs = REPO / "ingest" / "analysis" / "embed_corpus" / "outputs"
            if not emb_run_dir:
                emb_run_dir = resolve_matching_artifacts(emb_outputs, chunk_cfg.content_hash)

            if (
                not emb_run_dir
                or not (emb_run_dir / "embeddings.npy").exists()
                or not (emb_run_dir / "chunks.json").exists()
            ):
                target_desc = f"{emb_run_dir}" if emb_run_dir else f"{emb_outputs} for hash: {chunk_cfg.content_hash}"
                raise FileNotFoundError(
                    f"No matching embedding artifact (embeddings.npy / chunks.json) found in {target_desc}"
                )

            logger.info("Found matching upstream embedding artifact at %s", emb_run_dir)
            if (emb_run_dir / "config.lock.yaml").exists():
                upstream_lock_meta = read_lock_file(emb_run_dir / "config.lock.yaml")

            chunk_embeddings = np.load(emb_run_dir / "embeddings.npy")
            chunks = load_chunks_artifact(emb_run_dir / "chunks.json")

        assert len(chunks) == chunk_embeddings.shape[0], (
            f"chunks count ({len(chunks)}) != embedding rows ({chunk_embeddings.shape[0]})"
        )
        logger.info("Loaded %d embedded chunks (strategy=%s, quantized=%s)", len(chunks), chunk_cfg.render_strategy, use_quantized)

        # 2. Query embedder
        threads = int(self.config.get("threads", 4))
        embedder = Embedder(
            model_name=embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
            threads=threads,
        )

        # Batch embed eval queries for instant lookup instead of single-item inferences
        eval_data = json.loads(self.eval_data_path.read_text())
        q_texts = [q["query"] for q in eval_data["queries"]]
        with Timer(text=f"Embedded {len(q_texts)} queries in {{:.1f}}s", logger=logger.info):
            q_vecs = list(
                tqdm(
                    embedder.embed_queries(q_texts, batch_size=4),
                    total=len(q_texts),
                    desc="embedding queries",
                    unit="query",
                )
            )
        query_map = {q["query"]: vec for q, vec in zip(eval_data["queries"], q_vecs)}

        return {
            "k": k,
            "chunks": chunks,
            "corpus": corpus,
            "chunk_embeddings": chunk_embeddings,
            "embedder": embedder,
            "query_map": query_map,
            "upstream_lock": upstream_lock_meta,
        }

    def on_execute(self, prepared: dict) -> dict:
        return trigger_retrieval_eval(
            eval_path=self.eval_data_path,
            chunks=prepared["chunks"],
            chunk_embeddings=prepared["chunk_embeddings"],
            corpus=prepared["corpus"],
            embed_query_fn=lambda q: prepared["query_map"].get(q, prepared["embedder"].embed_query(q)),
            k=prepared["k"],
        )

    def on_finalize(self, prepared: dict, result: dict) -> None:
        chunk_cfg = ChunkConfig.from_mapping(self.config)
        eval_params = {
            "k": int(self.config.get("k", 1)),
            **chunk_cfg.canonical_dict,
            "embedding_model": str(self.config.get("embedding_model")),
        }
        diagnostics = result.pop("diagnostics", [])
        if diagnostics:
            metrics_dict = result.get("metrics", {})
            plot_paths = generate_retrieval_plots(diagnostics, metrics_dict, eval_params["k"], self.run_dir)
            if self.tracker is not None:
                for name, path in plot_paths.items():
                    self.tracker.track_artifact(path, name=name, type="plot")

            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                renderer=lambda idx: format_passage(prepared["chunks"][idx], prepared["corpus"]),
                metrics=metrics_dict,
                params=eval_params,
                out_path=report_path,
            )
            result["report_path"] = str(report_path)
            preview = "\n".join(report_path.read_text().splitlines()[:6])
            logger.info("Saved report to %s:\n%s\n...", report_path, preview)
            if self.tracker is not None:
                self.tracker.track_artifact(report_path, name="retrieval-report", type="artifact-outputs")

        # Write immutable lock file for evaluation artifact
        lock_data = {
            "stage": "evaluation",
            "hash": chunk_cfg.content_hash,
            "parameters": eval_params,
            "output": {
                "metrics": result.get("metrics", {}),
                "total_queries": result.get("total_queries", 0),
                "resolvable": result.get("resolvable", 0),
            },
            "upstream": prepared.get("upstream_lock", {}),
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        logger.info("Saved evaluation artifact with lock to %s", self.run_dir)

        super().on_finalize(prepared, result)


JOB_CLASS = EvalJobQuestionToPassage
