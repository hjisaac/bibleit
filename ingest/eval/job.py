import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker
from decouple import config

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

    def _make_slug(self) -> str:
        """Override in subclasses to provide a concise parameter suffix for the run folder."""
        return ""

    def on_start(self) -> None:
        for key in self.path_config_keys:
            setattr(self, key, REPO / self.config[key])
        slug = self._make_slug()
        self.run_name = f"{self.run_id}_{slug}" if slug else self.run_id
        self.run_dir = Path(self.config.get("log_dir", "outputs")).resolve() / self.run_name

    def on_track(self) -> None:
        logger.info("Using config:\n%s", json.dumps(self.config, indent=2, default=str))
        if config("BIBLEIT_TRACKING_ENABLED", default=True, cast=bool):
            self.tracker = WBTracker(run_name=getattr(self, "run_name", self.run_id), project=self.project_name, config=self.config)
        else:
            self.tracker = None

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        metrics = result.get("metrics", {})
        logger.info("Metrics:\n%s", json.dumps(metrics, indent=2))

        payload = {"run_conditions": self.config, **result}
        target_dir = getattr(self, "run_dir", Path(self.config.get("log_dir", "outputs")))
        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = target_dir / "run.json"
        out_path.write_text(json.dumps(payload, indent=2, default=str))
        logger.info("Saved to %s", out_path)

        if self.tracker is not None:
            summary = dict(metrics)
            for k in ("total_queries", "resolvable"):
                if k in result:
                    summary[k] = result[k]
            self.tracker.track_summary(**summary)
            self.tracker.track_artifact(out_path, name="run-summary", type="artifact-outputs")

    def on_teardown(self) -> None:
        super().on_teardown()
        if hasattr(self, "run_dir"):
            log_dir = Path(self.config.get("log_dir", "outputs"))
            src_log = log_dir / f"{self.run_id}.log"
            dst_log = self.run_dir / "run.log"
            if src_log.exists():
                self.run_dir.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src_log), str(dst_log))
