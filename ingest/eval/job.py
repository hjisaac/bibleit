import json
import logging
import os
from pathlib import Path
from typing import Any

# Throttle BLAS and OpenMP thread pools so background evaluations do not starve the host OS
for _var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ.setdefault(_var, "2")

from crucible.core.jobs import AbstractJob
from crucible.core.trackers.wandb import WBTracker

from bibleit_ingest.constants import REPO

logger = logging.getLogger(__name__)


def dict_to_slug(params: dict[str, Any]) -> str:
    """Format dict key-values into {key}-{value} pairs joined by underscores."""
    return "_".join(f"{k}-{v}" for k, v in params.items() if v is not None)


class EvalJobBase(AbstractJob):
    """Base class for all bibleit evaluation and profiling jobs.
    Handles path resolution, W&B tracking under bibleit-eval, and saving results."""

    path_config_keys: tuple[str, ...] = ()
    category: str = "eval"

    def make_slug(self, params: dict[str, Any] | None = None) -> str:
        parts = [self.run_id]
        if tag := self.config.get("tag"):
            parts.append(str(tag))
        if params and (param_str := dict_to_slug(params)):
            parts.append(param_str)
        return "_".join(parts)

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
            self.tracker.track_artifact(out_path, name="run-summary", type="artifact-outputs")

    def on_teardown(self) -> None:
        super().on_teardown()
        if hasattr(self, "run_dir"):
            log_dir = Path(self.config.get("log_dir", "outputs"))
            src_log = log_dir / f"{self.run_id}.log"
            dst_log = self.run_dir / f"{self.run_id}.log"
            if src_log.exists() and self.run_dir != log_dir:
                import shutil
                self.run_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_log, dst_log)
