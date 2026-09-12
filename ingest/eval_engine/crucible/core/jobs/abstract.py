from abc import ABCMeta, abstractmethod
from datetime import datetime
from typing import Any

from crucible.core import settings  # noqa: F401 -- import loads .env before any job runs
from crucible.core.handlers.logger import configure_logging


class AbstractJob(metaclass=ABCMeta):
	"""Base class for all executable jobs."""

	def __init__(self, config) -> None:
		self.config = config
		self._run_id = self._build_run_id()
		self.tracker = None
		configure_logging(config, self._run_id)

	@staticmethod
	def _build_run_id() -> str:
		now = datetime.now()
		return f"{now.strftime('%Y-%b-%d_%H-%M-%S')}-{now.microsecond // 1000:03d}"

	@property
	def run_id(self) -> str:
		"""Unique identifier for a single run (execution) of this job, used for logging and tracking."""
		return self._run_id

	def execute(self) -> Any:
		"""Run the full job lifecycle: prepare, execute, finalize, and teardown."""
		self.on_start()
		self.on_prepare()
		self.on_track()

		result = None
		try:
			result = self.on_execute()
			self.on_finalize(result)
			return result
		except Exception as exc:
			self.on_fail(exc)
			raise
		finally:
			self.on_teardown()

	def on_start(self) -> None:
		"""Optional hook before preparation (logging banners, config validation)."""
		pass

	@abstractmethod
	def on_prepare(self) -> None:
		"""Prepare runtime state on ``self`` (data paths, clients, datasets, etc.)."""
		pass

	def on_track(self) -> None:
		"""Optional hook to attach an experiment tracker to ``self.tracker``."""
		self.tracker = None

	@abstractmethod
	def on_execute(self) -> Any:
		"""Run the job's main work and return a small, serializable result."""
		pass

	def on_finalize(self, result: Any) -> None:
		"""Post-run hook: persist artifacts, log summaries, etc."""
		if self.tracker is not None and isinstance(result, dict):
			self.tracker.track_summary(**result)

	def on_fail(self, exc: BaseException) -> None:
		"""Optional hook when ``on_execute`` raises."""
		pass

	def on_teardown(self) -> None:
		"""Always runs in ``finally``; close trackers and release resources."""
		if self.tracker is not None:
			self.tracker.finish()
