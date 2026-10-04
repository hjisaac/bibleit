import itertools
import json
import logging
from pathlib import Path
from typing import Any

from joblib import Parallel, delayed

from crucible.core.config.overrides import apply_overrides
from crucible.core.constants import UNSAFE_IN_FILENAME
from crucible.core.jobs import AbstractJob
from crucible.core.types import OnError, RunState
from crucible.core.utils import new_timestamped_id

logger = logging.getLogger(__name__)


def _slug(overrides: dict[str, Any]) -> str:
	"""A filename-safe tag for one combination, since run_id ends up as a
	log and result filename."""
	raw = ",".join(f"{key}={value}" for key, value in overrides.items())
	return UNSAFE_IN_FILENAME.sub("-", raw)


def _run_one(
	job_class: type[AbstractJob],
	base_config: dict[str, Any],
	overrides: dict[str, Any],
	sweep_id: str,
	on_error: OnError,
) -> dict[str, Any]:
	run_id = f"{sweep_id}__{_slug(overrides)}" if overrides else sweep_id
	config = apply_overrides(base_config, {**overrides, "run_id": run_id})
	run = {"sweep_id": sweep_id, "overrides": overrides, "run_id": run_id}
	try:
		result = job_class(config=config).execute()
	except Exception as exc:
		if on_error == "raise":
			raise
		logger.exception("Run failed (run_id=%s, overrides=%s)", run_id, overrides)
		return {**run, "state": RunState.FAILED, "error": str(exc)}
	return {**run, "state": RunState.COMPLETE, "result": result}


def run_job(
	job_class: type[AbstractJob],
	config: dict[str, Any],
	*,
	n_jobs: int = 1,
	on_error: OnError | None = None,
) -> list[dict[str, Any]]:
	"""Run a job and return one dict per run. The config decides how many:
	every list value in it is an axis to vary, so all-scalars means a single
	run and any list means one run per combination, across n_jobs workers.
	A lone run raises on failure; a set of them records failures instead, so
	one bad combination doesn't abort the rest. Pass on_error to force either."""
	axes = {key: value for key, value in config.items() if isinstance(value, list) and value}
	base = {key: value for key, value in config.items() if key not in axes}

	# No axes yields one empty combination, which is what makes a single run
	# and a sweep the same path.
	points = [dict(zip(axes, combo)) for combo in itertools.product(*axes.values())]
	if on_error is None:
		on_error = "raise" if len(points) == 1 else "record"

	sweep_id = new_timestamped_id()
	return Parallel(n_jobs=min(n_jobs, len(points)))(
		delayed(_run_one)(job_class, base, overrides, sweep_id, on_error) for overrides in points
	)


def save_runs(runs: list[dict[str, Any]], path: Path) -> list[dict[str, Any]]:
	"""Write one row per run as a comparison table, and return those rows."""
	rows = []
	for run in runs:
		complete = run["state"] is RunState.COMPLETE
		rows.append(
			{
				# Overrides as columns, so runs line up side by side.
				**run["overrides"],
				"run_id": run["run_id"],
				"state": run["state"].value,
				# Raw result, whatever shape the job returned.
				"result" if complete else "error": run["result"] if complete else run["error"],
			}
		)

	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(json.dumps(rows, indent=2, default=str))
	return rows
