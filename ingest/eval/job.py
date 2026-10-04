import json
import logging
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

from bibleit_ingest.constants import REPO

logger = logging.getLogger(__name__)


class EvalJobBase(AbstractJob):
    """Base class for all bibleit evaluation and profiling jobs.
    Handles path resolution, W&B tracking under bibleit-eval, and saving results."""

    path_config_keys: tuple[str, ...] = ()
    category: str = "eval"

    @property
    def project_name(self) -> str:
        parts = self.__class__.__module__.split(".")
        raw = parts[-2] if len(parts) >= 2 else self.__class__.__name__.lower()
        name = raw.replace("_", "-").removesuffix("-eval").removesuffix("-analysis")
        return f"bibleit-{self.category}-{name}"

    def on_start(self) -> None:
        for key in self.path_config_keys:
            setattr(self, key, REPO / self.config[key])

    def on_track(self) -> None:
        logger.info("Using config:\n%s", json.dumps(self.config, indent=2, default=str))
        run_name = getattr(self, "slug", self.run_id)
        self.tracker = WBTracker(run_name=run_name, project=self.project_name, config=self.config)

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        metrics = result.get("metrics", {})
        logger.info("Metrics:\n%s", json.dumps(metrics, indent=2))

        payload = {"run_conditions": self.config, **result}
        target_dir = getattr(self, "run_dir", Path(self.config.get("log_dir", "outputs")))
        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = target_dir / f"{self.run_id}.json"
        out_path.write_text(json.dumps(payload, indent=2, default=str))
        logger.info("Saved to %s", out_path)

        if self.tracker is not None:
            summary = dict(metrics)
            for k in ("total_queries", "resolvable"):
                if k in result:
                    summary[k] = result[k]
            self.tracker.track_summary(**summary)
            self.tracker.track_artifact(out_path, name="eval-result", type="eval_result")
