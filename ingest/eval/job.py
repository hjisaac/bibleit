import json
import logging
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

from bibleit_ingest.constants import REPO

logger = logging.getLogger(__name__)


class EvalJob(AbstractJob):
    """Base class for bibleit's retrieval-only eval jobs. A subclass only
    writes on_prepare and on_execute (returning trigger_eval's result
    unchanged); this handles config path resolution, the W&B tracker,
    and saving/tracking the result."""

    # REPO-relative config keys, resolved to Path and set as self.<key>
    # before on_prepare runs.
    path_config_keys: tuple[str, ...] = ()

    def on_start(self) -> None:
        for key in self.path_config_keys:
            setattr(self, key, REPO / self.config[key])

    def on_track(self) -> None:
        # Runs after on_prepare, so runtime-derived config fields are set.
        logger.info("Using config:\n%s", json.dumps(self.config, indent=2, default=str))
        self.tracker = WBTracker(run_name=self.run_id, project="bibleit-eval", config=self.config)

    def on_finalize(self, result: dict[str, Any]) -> None:
        logger.info("Metrics:\n%s", json.dumps(result["metrics"], indent=2))

        payload = {"run_conditions": self.config, **result}
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
