import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from fastembed import TextEmbedding

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
    render_chunk_text,
)
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR, REPO
from bibleit_ingest.embedding import embed_documents
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

logger = logging.getLogger(__name__)


class Job(AbstractJob):
    def on_start(self) -> None:
        self.web_path = REPO / self.config["web_path"]
        self.bsb_dir = REPO / self.config["bsb_dir"]
        self.log_dir = REPO / self.config["log_dir"]
        self.log_dir.mkdir(parents=True, exist_ok=True)

        tag = self.config.get("tag")
        tag_str = f"_{tag}" if tag else ""
        floor = self.config["floor"]
        ceiling = self.config["ceiling"]
        self.slug = f"{self.run_id}{tag_str}_f{floor}_c{ceiling}"
        self.run_dir = self.log_dir / self.slug


    def on_track(self) -> None:
        logger.info("Using config:\n%s", json.dumps(self.config, indent=2, default=str))
        self.tracker = WBTracker(
            run_name=self.slug, project="bibleit-chunk-profile", config=self.config
        )

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

        texts = []
        token_lengths = []
        word_counts = []
        verse_counts = [c.verse_count for c in chunks]

        for chunk in chunks:
            text = render_chunk_text(chunk, ordered_verses, address_index)
            texts.append(text)
            token_lengths.append(len(tokenizer.encode(text).ids))
            word_counts.append(len(text.split()))

        return {
            "chunks": chunks,
            "texts": texts,
            "token_lengths": token_lengths,
            "word_counts": word_counts,
            "verse_counts": verse_counts,
        }

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        chunks = result["chunks"]
        token_lengths = result["token_lengths"]
        limit = int(self.config.get("token_limit", 512))
        truncated = sum(1 for t in token_lengths if t > limit)
        trunc_pct = (truncated / len(chunks) * 100) if chunks else 0.0

        metrics = {
            "total_chunks": len(chunks),
            "min_tokens": int(np.min(token_lengths)),
            "max_tokens": int(np.max(token_lengths)),
            "mean_tokens": round(float(np.mean(token_lengths)), 2),
            "p50_tokens": round(float(np.percentile(token_lengths, 50)), 2),
            "p90_tokens": round(float(np.percentile(token_lengths, 90)), 2),
            "p95_tokens": round(float(np.percentile(token_lengths, 95)), 2),
            "p99_tokens": round(float(np.percentile(token_lengths, 99)), 2),
            "truncated_count": truncated,
            "truncation_pct": round(trunc_pct, 2),
            "mean_verses": round(float(np.mean(result["verse_counts"])), 2),
            "mean_words": round(float(np.mean(result["word_counts"])), 2),
        }
        logger.info("Distribution metrics:\n%s", json.dumps(metrics, indent=2))

        if self.tracker is not None:
            self.tracker.track_summary(**metrics)

        self._save_artifacts(prepared, result, metrics)

    def _save_artifacts(
        self, prepared: dict, result: dict[str, Any], metrics: dict[str, Any]
    ) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)
        chunks_file = self.run_dir / "chunks.jsonl"
        with chunks_file.open("w", encoding="utf-8") as f:
            for i, chunk in enumerate(result["chunks"]):
                record = {
                    "id": i,
                    "book": chunk.book,
                    "chapter": chunk.pericopes[0].chapter,
                    "verse": chunk.pericopes[0].verse,
                    "headings": chunk.headings,
                    "verse_count": chunk.verse_count,
                    "tokens": result["token_lengths"][i],
                    "words": result["word_counts"][i],
                    "text": result["texts"][i],
                }
                f.write(json.dumps(record) + "\n")

        embeddings_file = None
        if emb_model_name := self.config.get("embedding_model"):
            logger.info("Computing embeddings for %d chunks using %s", len(result["chunks"]), emb_model_name)
            embeddings = list(embed_documents(prepared["embed_model"], result["texts"]))
            matrix = np.array(embeddings)
            embeddings_file = self.run_dir / "embeddings.npy"
            np.save(embeddings_file, matrix)
            logger.info("Saved embeddings matrix of shape %s to %s", matrix.shape, embeddings_file)

        payload = {
            "run_conditions": self.config,
            "slug": self.slug,
            "metrics": metrics,
            "artifacts": {
                "chunks": str(chunks_file.relative_to(REPO)),
                "embeddings": str(embeddings_file.relative_to(REPO)) if embeddings_file else None,
            },
        }
        out_path = self.run_dir / f"{self.run_id}.json"
        out_path.write_text(json.dumps(payload, indent=2, default=str))
        logger.info("Saved run summary to %s", out_path)

        if self.tracker is not None:
            self.tracker.track_artifact(out_path, name="chunk-profile-summary", type="eval_result")


JOB_CLASS = Job
