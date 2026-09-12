import json
import logging
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

from bibleit_ingest.constants import REPO

logger = logging.getLogger(__name__)


class EvalJob(AbstractJob):
    """
    Base class for bibleit's retrieval-only eval jobs (see
    eval/helpers.trigger_eval, which every concrete on_execute is
    expected to call and return the result of unchanged: a dict with
    total_queries, resolvable, and metrics keys). Handles what's the
    same across every eval -- resolving REPO-relative config paths,
    attaching a W&B tracker under one consistent project, saving the
    result to disk and tracking it -- so a new eval job only ever writes
    on_prepare (load whatever it needs) and on_execute (run it).
    """

    # Config keys whose values are REPO-relative path strings. Resolved
    # to real Path objects and exposed as self.<key> before on_prepare
    # runs, so a subclass never repeats `REPO / self.config["..."]`
    # itself.
    path_config_keys: tuple[str, ...] = ()

    def on_start(self) -> None:
        for key in self.path_config_keys:
            setattr(self, key, REPO / self.config[key])

    def on_track(self) -> None:
        # Logged here, not in on_start: this runs after on_prepare (see
        # AbstractJob.execute's on_start -> on_prepare -> on_track
        # order), so any runtime-derived field a subclass added to
        # self.config during its own on_prepare (e.g. which model
        # actually produced a cached artifact) is already present.
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
