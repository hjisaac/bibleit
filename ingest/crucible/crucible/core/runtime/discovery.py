import importlib
import inspect
import sys
from pathlib import Path
from typing import Any

from crucible.core.jobs import AbstractJob
from crucible.core.constants import JOBS_ROOTS, WORKSPACE_ROOT


def _ensure_roots_importable() -> None:
    workspace_str = str(WORKSPACE_ROOT)
    if workspace_str not in sys.path:
        sys.path.insert(0, workspace_str)


def list_available_jobs() -> list[str]:
    """Return the names of job packages discovered across all job roots."""
    jobs = []
    for root in JOBS_ROOTS:
        if root.exists():
            for path in root.iterdir():
                if path.is_dir() and (path / "__init__.py").exists() and (path / "job.py").exists():
                    jobs.append(path.name)
    return sorted(jobs)


def find_job_dir(job_name: str) -> tuple[Path, str]:
    normalized = job_name.strip().lower()
    if "/" in normalized:
        prefix, name = normalized.split("/", 1)
        for root in JOBS_ROOTS:
            if root.name == prefix:
                candidate = root / name
                if candidate.is_dir() and (candidate / "__init__.py").exists() and (candidate / "job.py").exists():
                    return candidate, root.name
    for root in JOBS_ROOTS:
        candidate = root / normalized
        if candidate.is_dir() and (candidate / "__init__.py").exists() and (candidate / "job.py").exists():
            return candidate, root.name
    raise ValueError(f"Job '{normalized}' was not found across roots: {[r.name for r in JOBS_ROOTS]}")


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
    """Resolve a concrete job class across discovered job roots."""
    job_dir, root_name = find_job_dir(job_name)
    _ensure_roots_importable()
    module_name = f"{root_name}.{job_dir.name}"
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        raise ValueError(f"Job '{job_name}' could not be imported as '{module_name}'.") from exc

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
        f"Job '{job_name}' does not expose a concrete job class. "
        "Export Job or JOB_CLASS from jobs/<job>/__init__.py."
    )
