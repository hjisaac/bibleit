import json
import logging
from functools import partial
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding
from joblib import Memory

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
)
from bibleit_ingest.constants import BSB_DIR, FASTEMBED_CACHE_DIR, REPO, EmbeddingModel
from bibleit_ingest.embedding import embed_query
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from eval.helpers import trigger_eval
from eval.job import EvalJobBase

logger = logging.getLogger(__name__)

# Keyed on web_path/bsb_dir only -- same chunking/index every run regardless
# of k or embedding_model, so a sweep over those never redoes it. Caveat:
# keyed on the path strings, not file content, so editing web.json/BSB in
# place without changing the path would silently serve a stale result.
_memory = Memory(location=str(REPO / "ingest" / ".crucible_cache"), verbose=0)


@_memory.cache
def _build_chunks_and_index(web_path: Path, bsb_dir: Path):
    ordered_verses = load_web_verses(web_path)
    address_index = index_verses_by_address(ordered_verses)
    web_addresses_by_book = group_verse_addresses_by_book(ordered_verses)
    bsb_native = derive_bsb_pericopes(bsb_dir)
    resolved, _ = project_pericopes(bsb_native, web_addresses_by_book)
    chunks = FloorCeilingMergeChunker().chunk_bible(resolved)
    return chunks, address_index


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "chunk_embeddings_path",
        "chunk_embeddings_npy_path",
        "web_path",
    )

    def on_prepare(self) -> dict:
        k = int(self.config["k"])
        embedding_model = EmbeddingModel(self.config["embedding_model"])

        # Which model actually produced the cache -- only knowable at runtime.
        cached = json.loads(self.chunk_embeddings_path.read_text())
        self.config["chunk_source_model"] = cached["model"]

        chunks, address_index = _build_chunks_and_index(self.web_path, BSB_DIR)

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
            "address_index": address_index,
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


JOB_CLASS = EvalJobQuestionToPassage
