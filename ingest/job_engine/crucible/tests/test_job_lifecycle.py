from pathlib import Path
from typing import Any

import pytest

from crucible.core.jobs import AbstractJob, AbstractTrainerJob
from crucible.core.trackers.abstract import AbstractTracker


class _RecordingTracker(AbstractTracker):
	def __init__(self, run_name: str, config: dict[str, Any] | None = None, **kwargs: Any):
		self.run_name = run_name
		self.config = config or {}
		self.calls: list[str] = []

	def track_metrics(self, step: int, **metrics: Any) -> None:
		self.calls.append("track_metrics")

	def track_config(self, **params: Any) -> None:
		self.calls.append("track_config")

	def track_summary(self, **metrics: Any) -> None:
		self.calls.append(f"track_summary:{metrics}")

	def finish(self) -> None:
		self.calls.append("finish")


class _PlainJob(AbstractJob):
	def __init__(self, config, *, fail: bool = False) -> None:
		super().__init__(config)
		self.fail = fail
		self.events: list[str] = []

	def on_start(self) -> None:
		self.events.append("start")

	def on_prepare(self) -> None:
		self.events.append("prepare")
		self.prepared = True

	def on_track(self) -> None:
		self.events.append("track")
		self.tracker = _RecordingTracker(run_name=self.run_id)

	def on_execute(self) -> dict[str, str]:
		self.events.append("execute")
		if self.fail:
			raise RuntimeError("boom")
		return {"status": "ok"}

	def on_finalize(self, result: Any) -> None:
		self.events.append(f"finalize:{result}")
		super().on_finalize(result)

	def on_fail(self, exc: BaseException) -> None:
		self.events.append(f"fail:{exc}")

	def on_teardown(self) -> None:
		self.events.append("teardown")
		super().on_teardown()


class _TrainerJob(AbstractTrainerJob):
	def on_prepare_data(self) -> None:
		self.data = {"ready": True}

	def on_prepare_model(self) -> None:
		self.model = {"name": "mlp"}

	def on_prepare_metrics(self) -> None:
		self.metrics = {}

	def on_train(self) -> dict[str, str]:
		return {"status": "ok", "phase": "train"}

	def on_evaluate(self) -> dict[str, str]:
		return {"accuracy": "0.9"}


@pytest.fixture
def minimal_config(tmp_path: Path) -> dict[str, str]:
	return {
		"log_dir": str(tmp_path / "logs"),
		"log_console_level": "INFO",
		"log_file_level": "DEBUG",
	}


def test_execute_runs_hooks_in_order(minimal_config: dict[str, str]) -> None:
	job = _PlainJob(config=minimal_config)

	result = job.execute()

	assert result == {"status": "ok"}
	assert job.events == [
		"start",
		"prepare",
		"track",
		"execute",
		"finalize:{'status': 'ok'}",
		"teardown",
	]
	assert job.tracker.calls == ["track_summary:{'status': 'ok'}", "finish"]


def test_execute_calls_failure_and_teardown_on_error(minimal_config: dict[str, str]) -> None:
	job = _PlainJob(config=minimal_config, fail=True)

	with pytest.raises(RuntimeError, match="boom"):
		job.execute()

	assert "fail:boom" in job.events
	assert job.events[-1] == "teardown"
	assert job.tracker.calls[-1] == "finish"


def test_trainer_merges_train_and_eval_results(minimal_config: dict[str, str]) -> None:
	job = _TrainerJob(config=minimal_config)

	result = job.execute()

	assert result == {"status": "ok", "phase": "train", "accuracy": "0.9"}
