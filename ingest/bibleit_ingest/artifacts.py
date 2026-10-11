import json
import logging
from pathlib import Path
from typing import Any

from omegaconf import OmegaConf

logger = logging.getLogger(__name__)

LOCK_FILENAME = "config.lock.yaml"


def write_lock_file(path: Path, data: dict[str, Any]) -> Path:
    """Writes a read-only (chmod 444) YAML lock file capturing artifact generation metadata."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.chmod(0o644)  # temporarily unprotect if overwriting
    content = OmegaConf.to_yaml(OmegaConf.create(data))
    path.write_text(content, encoding="utf-8")
    path.chmod(0o444)  # mark read-only to prevent accidental edits
    return path


def read_lock_file(path: Path) -> dict[str, Any]:
    """Reads a YAML lock file returning a dictionary."""
    if not path.exists():
        raise FileNotFoundError(f"Lock file not found: {path}")
    cfg = OmegaConf.load(str(path))
    container = OmegaConf.to_container(cfg, resolve=True)
    return container if isinstance(container, dict) else {}


def resolve_matching_artifacts(
    stage_outputs_dir: Path,
    criteria: dict[str, Any],
) -> Path | None:
    """Scans subdirectories in stage_outputs_dir for a config.lock.yaml matching criteria.

    Returns the newest matching run directory, or None if no match is found.
    """
    if not stage_outputs_dir.exists():
        return None

    matches: list[Path] = []
    # Search run subdirectories in stage_outputs_dir
    candidates = sorted(
        [d for d in stage_outputs_dir.iterdir() if d.is_dir()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for run_dir in candidates:
        lock_path = run_dir / LOCK_FILENAME
        if not lock_path.exists():
            continue
        try:
            lock_data = read_lock_file(lock_path)
            params = lock_data.get("parameters", lock_data)
            # Check if all criteria key-value pairs match params
            if all(params.get(k) == v for k, v in criteria.items()):
                matches.append(run_dir)
        except Exception as exc:
            logger.debug("Failed reading lock file %s: %s", lock_path, exc)

    if matches:
        chosen = matches[0]
        logger.info("Resolved matching artifact at %s matching %s", chosen, criteria)
        return chosen

    logger.warning("No artifact matching %s found in %s", criteria, stage_outputs_dir)
    return None
