import logging
from typing import Any

from datalens import AnalysisConfig, run_analysis

from bibleit_ingest.artifacts import (
    save_chunks_artifact,
    write_inspection_samples,
    write_lock_file,
)
from bibleit_ingest.chunking import get_chunker
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, OLD_TESTAMENT_BOOKS
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.renderers import get_renderer
from bibleit_ingest.types import ChunkConfig
from analysis.job import AnalysisJobBase

logger = logging.getLogger(__name__)


class AnalysisJobChunkingStrategy(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def _make_slug(self) -> str:
        return ChunkConfig(**self.config["chunk"]).slug

    def on_prepare(self) -> dict:
        corpus, pericopes = get_or_prepare_corpus(self.web_path, self.bsb_dir)

        tok_model_name = self.config.get(
            "tokenizer_model", "nomic-ai/nomic-embed-text-v1.5"
        )
        embedder = Embedder(
            model_name=tok_model_name, cache_dir=str(FASTEMBED_CACHE_DIR)
        )

        return {
            "pericopes": pericopes,
            "corpus": corpus,
            "embedder": embedder,
        }

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        corpus = prepared["corpus"]
        pericopes = prepared["pericopes"]
        chunk_data = dict(self.config["chunk"])
        if "tokenizer" not in chunk_data and "embedder" in prepared:
            chunk_data["tokenizer"] = prepared["embedder"].model.tokenizer
        chunk_cfg = ChunkConfig(**chunk_data)

        logger.info(
            "Chunking corpus: strategy=%s, ceiling=%s, overlap=%s, renderer=%s",
            chunk_cfg.strategy,
            chunk_cfg.ceiling,
            chunk_cfg.overlap,
            chunk_cfg.render_strategy,
        )

        chunker = get_chunker(chunk_cfg, corpus=corpus)
        chunks = chunker.chunk(pericopes, corpus=corpus)
        logger.info("Generated %d chunks; evaluating token distributions...", len(chunks))

        tokenizer = prepared["embedder"].model.tokenizer
        limit = int(self.config.get("token_limit", 512))
        renderer = get_renderer(
            strategy=chunk_cfg.render_strategy,
            corpus=corpus,
        )

        texts = []
        records = []
        truncated = 0

        # Single pass: render, tokenize, and record metadata
        for chunk in chunks:
            text = renderer.render(chunk)
            t_len = len(tokenizer.encode(text).ids)
            if t_len > limit:
                truncated += 1

            texts.append(text)
            records.append({
                "book": chunk.book,
                "testament": "OT" if chunk.book in OLD_TESTAMENT_BOOKS else "NT",
                "token_count": t_len,
                "word_count": len(text.split()),
                "verse_count": len(corpus.get_range(chunk.book, chunk.start, chunk.end)),
            })

        # Unified streaming corpus stats via datalens (with T-Digest quantiles)
        lens_cfg = AnalysisConfig(
            columns={
                "token_count": "quantile",
                "word_count": "quantile",
                "verse_count": "quantile",
                "book": "categorical",
            },
            quantiles=[0.01, 0.05, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99],
        )
        analysis_result = run_analysis(lens_cfg, source=records)
        corpus_stats = analysis_result.to_dict()
        group = corpus_stats.get("groups", {}).get("_all", {})
        tok = group.get("token_count", {})
        words = group.get("word_count", {})
        verses = group.get("verse_count", {})

        metrics = {
            "total_chunks": len(chunks),
            "min_tokens": int(tok.get("min", 0)),
            "max_tokens": int(tok.get("max", 0)),
            "p50_tokens": round(float(tok.get("p50", 0)), 2),
            "p90_tokens": round(float(tok.get("p90", 0)), 2),
            "p95_tokens": round(float(tok.get("p95", 0)), 2),
            "p99_tokens": round(float(tok.get("p99", 0)), 2),
            "truncated_count": truncated,
            "truncation_pct": round((truncated / len(chunks) * 100), 2) if chunks else 0.0,
            "p50_words": round(float(words.get("p50", 0)), 2),
            "p50_verses": round(float(verses.get("p50", 0)), 2),
        }

        return {
            "chunks": chunks,
            "texts": texts,
            "records": records,
            "metrics": metrics,
            "analysis_result": analysis_result,
            "corpus_stats": corpus_stats,
            "renderer": renderer,
        }

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)
        token_limit = float(self.config.get("token_limit", 512))
        plot_paths = result["analysis_result"].plot(
            out_dir=self.run_dir,
            sla={"token_count": token_limit},
        )
        if self.tracker is not None:
            for name, path in plot_paths.items():
                self.tracker.track_artifact(path, name=name, type="plot")

        save_chunks_artifact(self.run_dir / "chunks.json", result["chunks"])

        chunk_cfg = ChunkConfig(**self.config["chunk"])
        lock_data = {
            "stage": "chunking",
            "hash": chunk_cfg.content_hash,
            "parameters": {
                **chunk_cfg.canonical_dict,
                "tokenizer_model": self.config.get("tokenizer_model", "nomic-ai/nomic-embed-text-v1.5"),
            },
            "output": {
                "total_chunks": len(result["chunks"]),
                "truncation_pct": result["metrics"]["truncation_pct"],
                "p50_tokens": result["metrics"]["p50_tokens"],
            },
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        renderer = result.get("renderer")
        if renderer:
            write_inspection_samples(self.run_dir, result["chunks"], renderer)
        logger.info("Saved chunk artifact with lock to %s", self.run_dir)

        # Prune heavy in-memory data so logs and crucible output remain concise
        for key in ("chunks", "texts", "records", "analysis_result", "renderer"):
            result.pop(key, None)


JOB_CLASS = AnalysisJobChunkingStrategy
