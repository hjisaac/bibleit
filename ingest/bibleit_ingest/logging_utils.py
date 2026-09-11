"""
A small shared logging setup, used by eval scripts (and anything else
that wants it) to keep a run's log alongside its results, not just
printed to the console and lost once the terminal scrolls past it.
"""

import logging
from pathlib import Path


def setup_logger(name: str, log_path: Path) -> logging.Logger:
    """
    Returns a logger that writes to both the console and the given file.
    Creates the log file's parent directory if it doesn't exist yet.
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger
