import logging
from functools import partial
from pathlib import Path

from fastembed import TextEmbedding

from bibleit_ingest.chunking import AdaptiveWindowChunker
from bibleit_ingest.constants import (
    BSB_DIR,
    CRUCIBLE_CACHE_DIR,
    FASTEMBED_CACHE_DIR,
    EmbeddingModel,
)
from bibleit_ingest.embedding import embed_query, get_or_create_chunk_embeddings
from bibleit_ingest.pericopes import get_or_prepare_corpus
from eval.helpers import format_passage, generate_retrieval_report, trigger_eval
from eval.job import EvalJobBase

logger = logging.getLogger(__name__)


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "web_path",
    )

    def on_start(self) -> None:
        super().on_start()
        slug_parts = {
            "f": self.config.get("floor", 5),
            "c": self.config.get("ceiling", 30),
            "o": self.config.get("overlap", 0),
            "rnd": self.config.get("render_strategy", "heading_and_text"),
            "k": self.config.get("k", 1),
        }
        self.slug = self.make_slug(slug_parts)
        self.run_dir = Path(self.config["log_dir"]).resolve() / self.slug
        logger.info("=== Starting run [%s] ===", self.slug)

    def on_prepare(self) -> dict:
        k = int(self.config.get("k", 1))
        floor = int(self.config.get("floor", 5))
        ceiling = int(self.config.get("ceiling", 30))
        overlap = int(self.config.get("overlap", 0))
        render_strategy = str(self.config.get("render_strategy", "heading_and_text"))
        embedding_model = EmbeddingModel(self.config["embedding_model"])
        self.config["chunk_source_model"] = str(embedding_model)

        corpus = get_or_prepare_corpus(self.web_path, BSB_DIR)
        chunks = AdaptiveWindowChunker(
            ordered_verses=corpus.ordered_verses,
            address_index=corpus.address_index,
            floor=floor,
            ceiling=ceiling,
            overlap=overlap,
        ).chunk(corpus.pericopes)

        threads = int(self.config.get("threads", 4))
        model = TextEmbedding(
            model_name=embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
            threads=threads,
        )
        model_slug = embedding_model.replace("/", "_")
        cache_key = f"{model_slug}_f{floor}_c{ceiling}_o{overlap}_{render_strategy}.npy"

        chunk_embeddings = get_or_create_chunk_embeddings(
            chunks=chunks,
            ordered_verses=corpus.ordered_verses,
            model=model,
            render_strategy=render_strategy,
            cache_dir=CRUCIBLE_CACHE_DIR / "chunk_embeddings",
            cache_key=cache_key,
        )
        assert len(chunks) == chunk_embeddings.shape[0], (
            f"chunks count ({len(chunks)}) != embedding rows ({chunk_embeddings.shape[0]})"
        )
        logger.info("Loaded %d embedded chunks (strategy=%s)", len(chunks), render_strategy)

        # Batch embed eval queries for instant lookup instead of 150 single-item inferences
        eval_data = json.loads(self.eval_data_path.read_text())
        q_texts = [f"search_query: {q['query']}" for q in eval_data["queries"]]
        q_vecs = list(model.embed(q_texts, batch_size=32))
        query_map = {q["query"]: vec for q, vec in zip(eval_data["queries"], q_vecs)}

        return {
            "k": k,
            "chunks": chunks,
            "corpus": corpus,
            "address_index": corpus.address_index,
            "chunk_embeddings": chunk_embeddings,
            "model": model,
            "query_map": query_map,
        }

    def on_execute(self, prepared: dict) -> dict:
        return trigger_eval(
            self.eval_data_path,
            prepared["chunks"],
            prepared["chunk_embeddings"],
            prepared["address_index"],
            lambda q: prepared["query_map"].get(q, embed_query(prepared["model"], q)),
            k=prepared["k"],
        )

    def on_finalize(self, prepared: dict, result: dict) -> None:
        diagnostics = result.pop("diagnostics", [])
        if diagnostics:
            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                renderer=lambda idx: format_passage(prepared["chunks"][idx], prepared["corpus"].ordered_verses),
                metrics=result.get("metrics", {}),
                params={
                    "k": self.config.get("k", 1),
                    "floor": self.config.get("floor", 5),
                    "ceiling": self.config.get("ceiling", 30),
                    "overlap": self.config.get("overlap", 0),
                    "render_strategy": self.config.get("render_strategy", "heading_and_text"),
                    "embedding_model": self.config.get("embedding_model"),
                },
                out_path=report_path,
            )
            result["report_path"] = str(report_path)
            preview = "\n".join(report_path.read_text().splitlines()[:6])
            logger.info("Saved report to %s:\n%s\n...", report_path, preview)
            if self.tracker is not None:
                self.tracker.track_artifact(report_path, name="retrieval-report", type="artifact-outputs")

        super().on_finalize(prepared, result)


JOB_CLASS = EvalJobQuestionToPassage
