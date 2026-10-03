import logging
from pathlib import Path
from typing import Any

_FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"

_console_configured = False


def _formatter() -> logging.Formatter:
	return logging.Formatter(_FORMAT, datefmt=_DATEFMT)


def ensure_console_configured(console_level: str = "INFO") -> None:
	"""Attach the console handler once per process. Safe to call from every
	job instantiation; later calls are no-ops, so console level is fixed by
	whichever job runs first in a given process."""
	global _console_configured
	if _console_configured:
		return

	root = logging.getLogger()
	root.setLevel(logging.DEBUG)
	handler = logging.StreamHandler()
	handler.setLevel(console_level)
	handler.setFormatter(_formatter())
	root.addHandler(handler)
	_console_configured = True


def attach_run_file_handler(config: dict[str, Any], run_id: str) -> logging.Handler:
	"""Add a file handler scoped to this one job instance. Caller keeps the
	returned handler and passes it to detach_run_file_handler in teardown --
	never looked up by name, so concurrent instances never touch each other's
	handler."""
	log_dir = Path(config["log_dir"])
	log_dir.mkdir(parents=True, exist_ok=True)

	handler = logging.FileHandler(str(log_dir / f"{run_id}.log"))
	handler.setLevel(config.get("log_file_level", "DEBUG"))
	handler.setFormatter(_formatter())
	logging.getLogger().addHandler(handler)
	return handler


def detach_run_file_handler(handler: logging.Handler) -> None:
	logging.getLogger().removeHandler(handler)
	handler.close()
