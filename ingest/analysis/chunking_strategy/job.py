import json
import logging
from pathlib import Path
from typing import Any

from fastembed import TextEmbedding

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
    render_chunk_text,
)
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, OLD_TESTAMENT_BOOKS, REPO
from bibleit_ingest.embedding import save_chunk_embeddings
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from analysis.chunking_strategy.plots import generate_chunk_plots
from analysis.job import AnalysisJobBase

logger = logging.getLogger(__name__)


class AnalysisJobChunkingStrategy(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def on_start(self) -> None:
        super().on_start()
        tag = self.config.get("tag")
        tag_str = f"_{tag}" if tag else ""
        floor = self.config["floor"]
        ceiling = self.config["ceiling"]
        self.slug = f"{self.run_id}{tag_str}_f{floor}_c{ceiling}"
        self.run_dir = Path(self.config["log_dir"]).resolve() / self.slug

    def on_prepare(self) -> dict:
        ordered_verses = load_web_verses(self.web_path)
        address_index = index_verses_by_address(ordered_verses)
        web_addresses_by_book = group_verse_addresses_by_book(ordered_verses)

        bsb_native = derive_bsb_pericopes(self.bsb_dir)
        resolved, _ = project_pericopes(bsb_native, web_addresses_by_book)

        tok_model_name = self.config.get(
            "tokenizer_model", "nomic-ai/nomic-embed-text-v1.5"
        )
        embed_model = TextEmbedding(
            model_name=tok_model_name, cache_dir=str(FASTEMBED_CACHE_DIR)
        )

        return {
            "resolved_pericopes": resolved,
            "ordered_verses": ordered_verses,
            "address_index": address_index,
            "embed_model": embed_model,
        }

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        floor = int(self.config["floor"])
        ceiling = int(self.config["ceiling"])
        chunker = FloorCeilingMergeChunker(floor=floor, ceiling=ceiling)
        chunks = chunker.chunk_bible(prepared["resolved_pericopes"])

        tokenizer = prepared["embed_model"].model.tokenizer
        ordered_verses = prepared["ordered_verses"]
        address_index = prepared["address_index"]
        limit = int(self.config.get("token_limit", 512))

        texts = []
        records = []
        truncated = 0

        # Single pass: render, tokenize, and record metadata
        for chunk in chunks:
            text = render_chunk_text(chunk, ordered_verses, address_index)
            t_len = len(tokenizer.encode(text).ids)
            if t_len > limit:
                truncated += 1

            texts.append(text)
            records.append({
                "book": chunk.book,
                "testament": "OT" if chunk.book in OLD_TESTAMENT_BOOKS else "NT",
                "token_count": t_len,
                "word_count": len(text.split()),
                "verse_count": chunk.verse_count,
            })

        # Unified streaming corpus stats via datalens (with T-Digest quantiles)
        from datalens import AnalysisConfig, run_analysis

        lens_cfg = AnalysisConfig(
            columns={
                "token_count": "quantile",
                "word_count": "numeric",
                "verse_count": "numeric",
                "book": "categorical",
            },
            quantiles=[0.50, 0.90, 0.95, 0.99],
        )
        corpus_stats = run_analysis(lens_cfg, source=records).to_dict()
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
            "mean_words": round(float(words.get("mean", 0)), 2),
            "mean_verses": round(float(verses.get("mean", 0)), 2),
        }

        return {
            "chunks": chunks,
            "texts": texts,
            "records": records,
            "metrics": metrics,
            "corpus_stats": corpus_stats,
        }

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)
        token_limit = int(self.config.get("token_limit", 512))
        plot_paths = generate_chunk_plots(result["records"], self.run_dir, token_limit=token_limit)
        if self.tracker is not None:
            for name, path in plot_paths.items():
                self.tracker.track_artifact(path, name=name, type="plot")

        if emb_model := self.config.get("embedding_model"):
            logger.info("Embedding %d chunks with %s", len(result["chunks"]), emb_model)
            save_chunk_embeddings(
                result["chunks"], result["texts"], prepared["embed_model"], self.run_dir
            )


Job = AnalysisJobChunkingStrategy
JOB_CLASS = AnalysisJobChunkingStrategy
