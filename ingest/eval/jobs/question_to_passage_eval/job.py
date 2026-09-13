import json
import logging
from functools import partial

import numpy as np
from fastembed import TextEmbedding

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
)
from bibleit_ingest.constants import BSB_DIR, FASTEMBED_CACHE_DIR, EmbeddingModel
from bibleit_ingest.embedding import embed_query
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from eval.helpers import trigger_eval
from eval.job import EvalJob

logger = logging.getLogger(__name__)


class Job(EvalJob):
    path_config_keys = (
        "eval_data_path",
        "chunk_embeddings_path",
        "chunk_embeddings_npy_path",
        "web_path",
    )

    def on_prepare(self) -> None:
        self.k = int(self.config["k"])
        self.embedding_model = EmbeddingModel(self.config["embedding_model"])

        # Which model actually produced the cache -- only knowable at runtime.
        cached = json.loads(self.chunk_embeddings_path.read_text())
        self.config["chunk_source_model"] = cached["model"]

        # Recomputed, not reconstructed from the cache: it only keeps a
        # flat headings list, no per-pericope boundaries.
        self.ordered_verses = load_web_verses(self.web_path)
        self.address_index = index_verses_by_address(self.ordered_verses)
        web_addresses_by_book = group_verse_addresses_by_book(self.ordered_verses)
        bsb_native = derive_bsb_pericopes(BSB_DIR)
        resolved, _ = project_pericopes(bsb_native, web_addresses_by_book)
        self.chunks = FloorCeilingMergeChunker().chunk_bible(resolved)

        self.chunk_embeddings = np.load(self.chunk_embeddings_npy_path)
        assert len(self.chunks) == self.chunk_embeddings.shape[0], (
            f"recomputed {len(self.chunks)} chunks but {self.chunk_embeddings_npy_path} has "
            f"{self.chunk_embeddings.shape[0]} rows - embeddings are stale, rerun embed_chunks.py"
        )
        logger.info("Loaded %d embedded chunks", len(self.chunks))

        self.model = TextEmbedding(
            model_name=self.embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
        )

    def on_execute(self) -> dict:
        return trigger_eval(
            self.eval_data_path,
            self.chunks,
            self.chunk_embeddings,
            self.address_index,
            partial(embed_query, self.model),
            k=self.k,
        )


JOB_CLASS = Job
