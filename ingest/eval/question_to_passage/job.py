import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from bibleit_ingest.artifacts import (
    extract_chunk_criteria,
    format_chunk_slug,
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
from eval.job import EvalJobBase

logger = logging.getLogger(__name__)


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "web_path",
    )

    def _make_slug(self) -> str:
        k = self.config.get("k", 1)
        model = str(self.config.get("embedding_model", "nomic"))
        model_short = "nomic" if "nomic" in model else model.split("/")[-1]
        return f"k{k}_{format_chunk_slug(self.config)}_{model_short}"

    def on_start(self) -> None:
        super().on_start()
        logger.info("=== Starting run [%s] ===", self.run_id)

    def on_prepare(self) -> dict:
        k = int(self.config.get("k", 1))
        render_strategy = str(self.config.get("render_strategy", "heading_and_text"))
        embedding_model = EmbeddingModel(self.config["embedding_model"])
        self.config["chunk_source_model"] = str(embedding_model)

        corpus, _ = get_or_prepare_corpus(self.web_path, BSB_DIR)

        # 1. Resolve embedding artifact (explicit override, or auto-match from embed_corpus)
        # emb_dir_override: Optional path supplied in config to bypass search and use an explicit embedding artifact.
        emb_dir_override = self.config.get("embedding_artifact_dir")
        if emb_dir_override:
            emb_run_dir = Path(emb_dir_override)
            if not emb_run_dir.exists():
                raise FileNotFoundError(f"Specified embedding_artifact_dir does not exist: {emb_dir_override}")
        else:
            emb_run_dir = None

        # emb_outputs: Directory holding upstream embedding runs to search across.
        # emb_criteria: Hyperparameter filters that upstream config.lock.yaml must match exactly.
        emb_outputs = REPO / "ingest" / "analysis" / "embed_corpus" / "outputs"
        emb_criteria: dict[str, Any] = {
            **extract_chunk_criteria(self.config),
            "embedding_model": str(embedding_model),
        }

        if not emb_run_dir:
            emb_run_dir = resolve_matching_artifacts(emb_outputs, emb_criteria)

        if (
            not emb_run_dir
            or not (emb_run_dir / "embeddings.npy").exists()
            or not (emb_run_dir / "chunks.json").exists()
        ):
            target_desc = f"{emb_run_dir}" if emb_run_dir else f"{emb_outputs} for criteria: {emb_criteria}"
            raise FileNotFoundError(
                f"No matching embedding artifact (embeddings.npy / chunks.json) found in {target_desc}"
            )

        logger.info("Found matching upstream embedding artifact at %s", emb_run_dir)
        upstream_lock_meta: dict[str, Any] = {}
        if (emb_run_dir / "config.lock.yaml").exists():
            upstream_lock_meta = read_lock_file(emb_run_dir / "config.lock.yaml")

        chunk_embeddings = np.load(emb_run_dir / "embeddings.npy")
        chunks = load_chunks_artifact(emb_run_dir / "chunks.json")

        assert len(chunks) == chunk_embeddings.shape[0], (
            f"chunks count ({len(chunks)}) != embedding rows ({chunk_embeddings.shape[0]})"
        )
        logger.info("Loaded %d embedded chunks (strategy=%s)", len(chunks), render_strategy)

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
        eval_params = {
            "k": int(self.config.get("k", 1)),
            **extract_chunk_criteria(self.config),
            "embedding_model": str(self.config.get("embedding_model")),
        }
        diagnostics = result.pop("diagnostics", [])
        if diagnostics:
            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                renderer=lambda idx: format_passage(prepared["chunks"][idx], prepared["corpus"]),
                metrics=result.get("metrics", {}),
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
