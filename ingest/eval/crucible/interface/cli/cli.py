from pathlib import Path

import typer

from crucible.core.runtime.sweeping import save_runs
from crucible.interface.cli.utils import create_job_package, list_available_jobs, run_named_job

app = typer.Typer(
	no_args_is_help=True,
	help="Discover and run crucible jobs defined under jobs/.",
	pretty_exceptions_enable=False,
)


def _complete_job_name(incomplete: str) -> list[str]:
	return [name for name in list_available_jobs() if name.startswith(incomplete)]


@app.command("list")
def list_jobs() -> None:
	"""List discovered jobs."""
	for job_name in list_available_jobs():
		typer.echo(job_name)


@app.command("execute")
def execute_named(
	job_name: str = typer.Argument(
		..., help="Discovered job name (e.g. mlp).", autocompletion=_complete_job_name
	),
	config: str = typer.Option(
		"default",
		"--config",
		"-c",
		help="Config name under jobs/<job>/configs, or a path to a YAML file. Any list value in it is varied.",
	),
	overrides: list[str] = typer.Option(
		None,
		"--override",
		"-o",
		help="Hydra-style override(s), e.g. -o k=10 (repeat flag for multiple).",
	),
	n_jobs: int = typer.Option(1, "--n-jobs", help="Parallel workers (default 1 -- safe for shared model loading)."),
	out: Path = typer.Option(None, "--out", help="Where to write the comparison table when there is more than one run."),
) -> None:
	"""Execute a discovered crucible job. One run, or one per combination if
	the config varies anything."""
	runs = run_named_job(job_name, config, overrides=overrides, n_jobs=n_jobs)

	if len(runs) == 1:
		typer.echo(runs[0]["result"])
		return

	path = out or Path("runs") / f"{runs[0]['sweep_id']}.json"
	typer.echo(f"{len(runs)} runs finished.")
	for row in save_runs(runs, path):
		typer.echo(row)
	typer.echo(f"Saved to {path}")


@app.command("create")
def create_job(
	job_name: str = typer.Argument(..., help="Job package name under jobs/ (e.g. question_to_passage_eval)."),
	force: bool = typer.Option(False, "--force", help="Overwrite scaffold files if they already exist."),
) -> None:
	"""Create a new job package with starter files under jobs/<name>/."""
	try:
		created = create_job_package(job_name, force=force)
	except (ValueError, FileExistsError) as exc:
		raise typer.BadParameter(str(exc)) from exc

	typer.echo(f"Created job scaffold: {created}")


def main() -> None:
	app()
