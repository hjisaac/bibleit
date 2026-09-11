import logging
import logging.config
from pathlib import Path
from typing import Any

__RUN_FILE_PREFIX = "run_file:"

def _get_run_file_handler_name(run_id: str) -> str:
	return f"{__RUN_FILE_PREFIX}{run_id}"

def _get_logging_config(
	console_level: str,
	file_level: str,
	file_handler_name: str,
	log_file: str,
) -> dict[str, Any]:
	return {
		"version": 1,
		"disable_existing_loggers": False,
		"formatters": {
			"standard": {
				"format": "%(asctime)s [%(levelname)s] %(name)s - %(message)s",
				"datefmt": "%Y-%m-%d %H:%M:%S",
			}
		},
		"handlers": {
			"console": {
				"class": "logging.StreamHandler",
				"level": console_level,
				"formatter": "standard",
			},
			file_handler_name: {
				"class": "logging.FileHandler",
				"level": file_level,
				"formatter": "standard",
				"filename": log_file,
			},
		},
		"root": {
			"level": "DEBUG",
			"handlers": ["console", file_handler_name],
		},
	}


def configure_logging(config: dict[str, Any], run_id: str) -> None:
	"""Configure the root logger with a console handler and a per-run file handler.

	Any logging.getLogger(__name__) call anywhere in the codebase will
	propagate up to root and be captured automatically.
	"""
	log_dir = Path(config["log_dir"])
	log_dir.mkdir(parents=True, exist_ok=True)

	console_level = config.get("log_console_level", "INFO")
	file_level = config.get("log_file_level", "DEBUG")
	run_file_handler_name = _get_run_file_handler_name(run_id)

	# Clean up any existing run_file: handler before reconfiguring
	root = logging.getLogger()
	for handler in list(root.handlers):
		if (handler.get_name() or "").startswith(__RUN_FILE_PREFIX):
			root.removeHandler(handler)
			handler.close()

	logging.config.dictConfig(
		_get_logging_config(
			console_level=console_level,
			file_level=file_level,
			file_handler_name=run_file_handler_name,
			log_file=str(log_dir / f"{run_id}.log"),
		)
	)


