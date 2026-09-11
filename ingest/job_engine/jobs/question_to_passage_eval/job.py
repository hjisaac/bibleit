import json
import logging
from functools import partial
from pathlib import Path

import numpy as np
from box import Box
from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker
from fastembed import TextEmbedding

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
)
from bibleit_ingest.constants import (
    BSB_DIR,
    CHUNK_EMBEDDINGS_NPY_PATH,
    CHUNK_EMBEDDINGS_PATH,
    FASTEMBED_CACHE_DIR,
    REPO,
    WEB_PATH,
    EmbeddingModel,
)
from bibleit_ingest.embedding import embed_query
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from eval.helpers import trigger_eval

logger = logging.getLogger(__name__)


class Job(AbstractJob):
    def on_prepare(self) -> None:
        # REPO-anchored, not CWD-relative, unlike log_dir below: this path
        # is read by our own code, not by AbstractJob before on_prepare
        # even runs, so there's no reason to give up REPO's CWD-independence
        # for it the way log_dir has to.
        self.eval_data_path = REPO / self.config["eval_data_path"]
        self.k = int(self.config["k"])

        cached = json.loads(CHUNK_EMBEDDINGS_PATH.read_text())
        self.run_conditions = Box(
            frozen_box=True,
            chunk_embeddings_path=CHUNK_EMBEDDINGS_PATH,
            chunk_embeddings_npy_path=CHUNK_EMBEDDINGS_NPY_PATH,
            web_path=WEB_PATH,
            eval_data_path=self.eval_data_path,
            k=self.k,
            embedding_model=str(EmbeddingModel.NOMIC_EMBED_TEXT_V1_5),
            chunk_source_model=cached["model"],
        )
        logger.info(
            "Using run conditions:\n%s", self.run_conditions.to_json(indent=2, default=str)
        )

        # Recomputed fresh rather than reconstructed from chunk_embeddings.json:
        # the cache only keeps a flat `headings` list and one total
        # `verse_count` per chunk, with no record of which verses belong to
        # which heading within a merged chunk. Chunking is a pure function
        # of the BSB/WEB source data and the floor/ceiling parameters, none
        # of which change between runs, so recomputing it here reproduces
        # the exact same chunks embed_chunks.py produced, with every
        # pericope intact.
        self.ordered_verses = load_web_verses(WEB_PATH)
        self.address_index = index_verses_by_address(self.ordered_verses)
        web_addresses_by_book = group_verse_addresses_by_book(self.ordered_verses)
        bsb_native = derive_bsb_pericopes(BSB_DIR)
        resolved, _ = project_pericopes(bsb_native, web_addresses_by_book)
        self.chunks = FloorCeilingMergeChunker().chunk_bible(resolved)

        self.chunk_embeddings = np.load(CHUNK_EMBEDDINGS_NPY_PATH)
        assert len(self.chunks) == self.chunk_embeddings.shape[0], (
            f"recomputed {len(self.chunks)} chunks but {CHUNK_EMBEDDINGS_NPY_PATH} has "
            f"{self.chunk_embeddings.shape[0]} rows - embeddings are stale, rerun embed_chunks.py"
        )
        logger.info("Loaded %d embedded chunks", len(self.chunks))

        self.model = TextEmbedding(
            model_name=EmbeddingModel.NOMIC_EMBED_TEXT_V1_5,
            cache_dir=str(FASTEMBED_CACHE_DIR),
        )

    def on_track(self) -> None:
        self.tracker = WBTracker(
            run_name=self.run_id,
            project="bibleit-eval",
            config=self.run_conditions.to_dict(),
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

    def on_finalize(self, result: dict) -> None:
        logger.info("Metrics:\n%s", json.dumps(result["metrics"], indent=2))

        payload = {"run_conditions": self.run_conditions.to_dict(), **result}
        results_dir = Path(self.config["log_dir"])
        results_dir.mkdir(parents=True, exist_ok=True)
        out_path = results_dir / f"{self.run_id}.json"
        out_path.write_text(json.dumps(payload, indent=2, default=str))
        logger.info("Saved to %s", out_path)

        if self.tracker is not None:
            self.tracker.track_summary(
                total_queries=result["total_queries"],
                resolvable=result["resolvable"],
                **result["metrics"],
            )
            self.tracker.track_artifact(out_path, name="eval-result", type="eval_result")


JOB_CLASS = Job
