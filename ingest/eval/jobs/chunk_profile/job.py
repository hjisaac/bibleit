import json
import logging
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
    render_chunk_text,
)
from bibleit_ingest.constants import REPO
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes

logger = logging.getLogger(__name__)


class Job(AbstractJob):
    def on_start(self) -> None:
        self.web_path = REPO / self.config["web_path"]
        self.bsb_dir = REPO / self.config["bsb_dir"]
        self.log_dir = REPO / self.config["log_dir"]

    def on_track(self) -> None:
        logger.info("Using config:\n%s", json.dumps(self.config, indent=2, default=str))
        self.tracker = WBTracker(run_name=self.run_id, project="bibleit-chunk-profile", config=self.config)

    def on_prepare(self) -> dict:
        # TODO: Load verses, project pericopes, and apply chunker with floor/ceiling
        return {}

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        # TODO: Calculate token/verse distributions, quantiles, and truncation counts
        return {}

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        super().on_finalize(prepared, result)
        # TODO: Save metrics artifact, and conditionally compute embeddings if embedding_model is set


JOB_CLASS = Job
