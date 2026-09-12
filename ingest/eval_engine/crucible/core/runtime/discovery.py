import importlib
import inspect
import sys
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.constants import JOBS_ROOT


def _ensure_jobs_root_importable() -> None:
    """Makes `import jobs.<name>` resolve regardless of where JOBS_ROOT
    actually points. JOBS_ROOT can be redirected via CRUCIBLE_JOBS_ROOT
    (see constants.py) to a directory outside this repo, but the import
    below is hardcoded to the top-level name "jobs" -- without this,
    that only works by accident, when JOBS_ROOT's parent happens to
    already be on sys.path."""
    jobs_root_parent = str(JOBS_ROOT.parent)
    if jobs_root_parent not in sys.path:
        sys.path.insert(0, jobs_root_parent)


def list_available_jobs() -> list[str]:
    """Return the names of job packages discovered under the jobs root."""
    return sorted(
        path.name
        for path in JOBS_ROOT.iterdir()
        if path.is_dir() and (path / "__init__.py").exists()
    )


def _resolve_job_class(module: Any) -> type[AbstractJob] | None:
    job_class = getattr(module, "JOB_CLASS", None)
    if inspect.isclass(job_class) and issubclass(job_class, AbstractJob):
        if inspect.isabstract(job_class):
            raise ValueError("JOB_CLASS is abstract; expose a concrete class.")
        return job_class

    default_job_class = getattr(module, "Job", None)
    if inspect.isclass(default_job_class) and issubclass(default_job_class, AbstractJob):
        if inspect.isabstract(default_job_class):
            raise ValueError("Job is abstract; expose a concrete class.")
        return default_job_class

    return None


def resolve_job_class(job_name: str) -> type[AbstractJob]:
    """Resolve a concrete job class from jobs.<job_name>."""
    normalized_job_name = job_name.strip().lower()
    _ensure_jobs_root_importable()
    try:
        module = importlib.import_module(f"jobs.{normalized_job_name}")
    except ModuleNotFoundError as exc:
        raise ValueError(f"Job '{normalized_job_name}' was not found.") from exc

    resolved = _resolve_job_class(module)
    if resolved is not None:
        return resolved

    for _, candidate in inspect.getmembers(module, inspect.isclass):
        if candidate.__module__ != module.__name__:
            continue
        if candidate is AbstractJob:
            continue
        if issubclass(candidate, AbstractJob) and not inspect.isabstract(candidate):
            return candidate

    raise ValueError(
        f"Job '{normalized_job_name}' does not expose a concrete job class. "
        "Export Job or JOB_CLASS from jobs/<job>/__init__.py."
    )
