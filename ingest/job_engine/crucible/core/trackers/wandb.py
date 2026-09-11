from pathlib import Path
from typing import Any

import wandb

from .abstract import AbstractTracker


class WBTracker(AbstractTracker):
    """Tracks experiments using Weights & Biases."""

    def __init__(
        self,
        run_name: str,
        project: str = "ml-crucible",
        config: dict[str, Any] | None = None,
        **kwargs: Any,
    ):
        if config is None:
            config = {}

        self._run = wandb.init(
            project=project,
            name=run_name,
            config=config,
            **kwargs,
        )

    def track_metrics(self, step: int, **metrics: Any) -> None:
        if self._run is not None:
            self._run.log({"step": step, **metrics}, step=step)

    def track_config(self, **params: Any) -> None:
        if self._run is not None:
            self._run.config.update(params)

    def track_summary(self, **metrics: Any) -> None:
        if self._run is not None:
            for key, value in metrics.items():
                self._run.summary[key] = value

    def track_artifact(self, path: str | Path, name: str | None = None, type: str = "result") -> None:
        if self._run is not None:
            path = Path(path)
            artifact = wandb.Artifact(name=name or path.stem, type=type)
            artifact.add_file(str(path))
            self._run.log_artifact(artifact)

    def finish(self) -> None:
        if self._run is not None:
            self._run.finish()
