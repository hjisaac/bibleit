from abc import ABCMeta, abstractmethod
from typing import Any

from crucible.core import settings  # noqa: F401 -- import loads .env before any job runs
from crucible.core.handlers.logger import (
	attach_run_file_handler,
	detach_run_file_handler,
	ensure_console_configured,
)
from crucible.core.utils import new_timestamped_id


class AbstractJob(metaclass=ABCMeta):
	"""Base class for all executable jobs."""

	def __init__(self, config) -> None:
		self.config = config
		# A sweep injects its own run_id into config so a run's bookkeeping
		# id and its actual log/result file name are the same value.
		self._run_id = config.get("run_id") or new_timestamped_id()
		self.tracker = None
		ensure_console_configured(config.get("log_console_level", "INFO"))
		self._log_file_handler = attach_run_file_handler(config, self._run_id)

	@property
	def run_id(self) -> str:
		"""Unique identifier for a single run (execution) of this job, used for logging and tracking."""
		return self._run_id

	def execute(self) -> Any:
		"""Run the full job lifecycle: prepare, execute, finalize, and teardown."""
		self.on_start()
		prepared = self.on_prepare()
		self.on_track()

		result = None
		try:
			result = self.on_execute(prepared)
			self.on_finalize(prepared, result)
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
	def on_prepare(self) -> dict:
		"""Build and return whatever on_execute needs -- never store it on self."""
		pass

	def on_track(self) -> None:
		"""Optional hook to attach an experiment tracker to ``self.tracker``."""
		self.tracker = None

	@abstractmethod
	def on_execute(self, prepared: dict) -> Any:
		"""Run the job's main work from on_prepare's return value; return a small, serializable result."""
		pass

	def on_finalize(self, prepared: dict, result: Any) -> None:
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
		detach_run_file_handler(self._log_file_handler)
