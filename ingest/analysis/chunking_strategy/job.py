import json
import logging
from pathlib import Path
from typing import Any

from datalens import AnalysisConfig, run_analysis

from bibleit_ingest.artifacts import write_inspection_samples, write_lock_file
from bibleit_ingest.chunking import get_chunker
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, OLD_TESTAMENT_BOOKS, REPO
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.renderers import get_renderer
from analysis.job import AnalysisJobBase

logger = logging.getLogger(__name__)


class AnalysisJobChunkingStrategy(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def _make_slug(self) -> str:
        f = self.config.get("floor", 5)
        c = self.config.get("ceiling", 30)
        o = self.config.get("overlap", 1)
        ovh_flag = ""
        if o > 0 and "include_overlap_heading" in self.config:
            ovh_flag = "_ovh1" if self.config.get("include_overlap_heading") else "_ovh0"
        strat_map = {
            "text_only": "text",
            "heading_and_text": "heading",
            "book_and_heading": "book_heading",
            "address_and_heading": "addr_heading",
        }
        strat_key = str(self.config.get("render_strategy", "heading_and_text"))
        strat = strat_map.get(strat_key, strat_key[:8])
        if self.config.get("strategy") == "pericope":
            return f"peri_c{c}_o{o}{ovh_flag}_{strat}"
        if self.config.get("strategy") == "token_window":
            return f"tok_c{c}_o{o}{ovh_flag}_{strat}"
        return f"f{f}_c{c}_o{o}{ovh_flag}_{strat}"

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
        if "strategy" not in self.config:
            raise KeyError("Missing required 'strategy' parameter in chunking configuration")
        strategy_name = str(self.config["strategy"])
        render_strategy = str(self.config.get("render_strategy", "heading_and_text"))
        logger.info(
            "Chunking corpus: strategy=%s, ceiling=%s, overlap=%s, include_overlap_heading=%s, renderer=%s",
            strategy_name,
            self.config.get("ceiling"),
            self.config.get("overlap"),
            self.config.get("include_overlap_heading"),
            render_strategy,
        )

        chunk_cfg = dict(self.config)
        chunk_cfg.pop("strategy", None)
        if "tokenizer" not in chunk_cfg and "embedder" in prepared:
            chunk_cfg["tokenizer"] = prepared["embedder"].model.tokenizer

        chunker = get_chunker(
            strategy_name,
            corpus=corpus,
            **chunk_cfg,
        )
        chunks = chunker.chunk(pericopes, corpus=corpus)
        logger.info("Generated %d chunks; evaluating token distributions...", len(chunks))

        tokenizer = prepared["embedder"].model.tokenizer
        limit = int(self.config.get("token_limit", 512))
        renderer = get_renderer(
            strategy=render_strategy,
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

        # Save chunk definitions artifact
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

        lock_data = {
            "stage": "chunking",
            "parameters": {
                "floor": int(self.config.get("floor", 1)),
                "ceiling": int(self.config["ceiling"]),
                "overlap": int(self.config.get("overlap", 1)),
                "include_overlap_heading": bool(self.config.get("include_overlap_heading", True)),
                "strategy": self.config.get("strategy", "adaptive"),
                "render_strategy": self.config.get("render_strategy", "heading_and_text"),
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


JOB_CLASS = AnalysisJobChunkingStrategy
