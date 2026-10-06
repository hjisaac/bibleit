import json
import logging
from functools import partial
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

from bibleit_ingest.chunking import AdaptiveWindowChunker
from bibleit_ingest.constants import BSB_DIR, FASTEMBED_CACHE_DIR, EmbeddingModel
from bibleit_ingest.embedding import embed_query
from bibleit_ingest.pericopes import get_or_prepare_corpus
from eval.helpers import generate_retrieval_report, trigger_eval
from eval.job import EvalJobBase

logger = logging.getLogger(__name__)


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "chunk_embeddings_path",
        "chunk_embeddings_npy_path",
        "web_path",
    )

    def on_start(self) -> None:
        super().on_start()
        k = self.config.get("k", 10)
        self.slug = self.make_slug({"k": k})
        self.run_dir = Path(self.config["log_dir"]).resolve() / self.slug

    def on_prepare(self) -> dict:
        k = int(self.config["k"])
        embedding_model = EmbeddingModel(self.config["embedding_model"])

        # Which model actually produced the cache -- only knowable at runtime.
        cached = json.loads(self.chunk_embeddings_path.read_text())
        self.config["chunk_source_model"] = cached["model"]

        corpus = get_or_prepare_corpus(self.web_path, BSB_DIR)
        chunks = AdaptiveWindowChunker(
            ordered_verses=corpus.ordered_verses,
            address_index=corpus.address_index,
        ).chunk(corpus.pericopes)

        chunk_embeddings = np.load(self.chunk_embeddings_npy_path)
        assert len(chunks) == chunk_embeddings.shape[0], (
            f"recomputed {len(chunks)} chunks but {self.chunk_embeddings_npy_path} has "
            f"{chunk_embeddings.shape[0]} rows - embeddings are stale, rerun embed_chunks.py"
        )
        logger.info("Loaded %d embedded chunks", len(chunks))

        model = TextEmbedding(model_name=embedding_model, cache_dir=str(FASTEMBED_CACHE_DIR))

        return {
            "k": k,
            "chunks": chunks,
            "corpus": corpus,
            "address_index": corpus.address_index,
            "chunk_embeddings": chunk_embeddings,
            "model": model,
        }

    def on_execute(self, prepared: dict) -> dict:
        return trigger_eval(
            self.eval_data_path,
            prepared["chunks"],
            prepared["chunk_embeddings"],
            prepared["address_index"],
            partial(embed_query, prepared["model"]),
            k=prepared["k"],
        )

    def on_finalize(self, prepared: dict, result: dict) -> None:
        diagnostics = result.get("diagnostics", [])
        if diagnostics:
            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                chunks=prepared["chunks"],
                ordered_verses=prepared["corpus"].ordered_verses,
                metrics=result.get("metrics", {}),
                out_path=report_path,
            )
            logger.info("Saved retrieval inspection report to %s", report_path)
            if self.tracker is not None:
                self.tracker.track_artifact(report_path, name="retrieval-report", type="artifact-outputs")

        filtered = {k: v for k, v in result.items() if k != "diagnostics"}
        super().on_finalize(prepared, filtered)


JOB_CLASS = EvalJobQuestionToPassage
