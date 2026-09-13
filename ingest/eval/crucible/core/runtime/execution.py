import logging
from pathlib import Path
from typing import Any

from omegaconf import OmegaConf

from crucible.core.config.loader import load_run_config
from crucible.core.runtime.discovery import resolve_job_class

logger = logging.getLogger(__name__)


def _log_runtime_config(job_name: str, config_path: Path, config: dict[str, Any], overrides: list[str]) -> None:
    overrides_display = ", ".join(overrides) if overrides else "none"
    config_yaml = OmegaConf.to_yaml(OmegaConf.create(config), resolve=True)
    logger.warning(
        "Runtime config for job='%s' from '%s' | overrides=%s\n%s",
        job_name,
        config_path,
        overrides_display,
        config_yaml,
    )


def run_named_job(job_name: str, config_name: str, overrides: list[str] | None = None) -> Any:
    """Start a run of a discovered job: resolve its class, load config, and execute it."""
    job_class = resolve_job_class(job_name)
    config, config_path, resolved_overrides = load_run_config(job_name, config_name, overrides=overrides)
    _log_runtime_config(job_name, config_path, config, resolved_overrides)
    job = job_class(config=config)
    return job.execute()
