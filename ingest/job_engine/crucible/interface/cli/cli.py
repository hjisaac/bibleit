from enum import Enum
from typing import Any

import typer

from crucible.interface.cli.utils import create_job_package, list_available_jobs, run_named_job


class JobKind(str, Enum):
	job = "job"
	trainer = "trainer"


app = typer.Typer(
	no_args_is_help=True,
	help="Discover and run crucible jobs defined under jobs/.",
	pretty_exceptions_enable=False,
)


def _run_command(job_name: str, config: str = "default", overrides: list[str] | None = None) -> None:
	result = run_named_job(job_name, config, overrides=overrides)
	if result is not None:
		typer.echo(result)


def _build_run_command(job_name: str) -> Any:
	def command(
		config: str = typer.Option(
			"default",
			"--config",
			"-c",
			help="YAML config name under jobs/<job>/configs, with or without extension.",
		),
		overrides: list[str] = typer.Option(
			None,
			"--override",
			"-o",
			help="Hydra-style override(s), e.g. -o trainer.lr=1e-3 (repeat flag for multiple).",
		),
	) -> None:
		"""Start a run of a discovered crucible job."""
		_run_command(job_name, config, overrides=overrides)

	command.__name__ = f"run_{job_name}"
	command.__doc__ = f"Start a run of the {job_name} job."
	return command


for discovered_job in list_available_jobs():
	app.command(name=discovered_job)(_build_run_command(discovered_job))


@app.command("list")
def list_jobs() -> None:
	"""List discovered jobs."""
	for job_name in list_available_jobs():
		typer.echo(job_name)


@app.command("execute")
def execute_named(
	job_name: str = typer.Argument(..., help="Discovered job name (e.g. mlp)."),
	config: str = typer.Option(
		"default",
		"--config",
		"-c",
		help="YAML config name under jobs/<job>/configs, with or without extension.",
	),
	overrides: list[str] = typer.Option(
		None,
		"--override",
		"-o",
		help="Hydra-style override(s), e.g. -o trainer.lr=1e-3 (repeat flag for multiple).",
	),
) -> None:
	"""Execute a discovered crucible job by name (produces one run)."""
	_run_command(job_name, config, overrides=overrides)


@app.command("create")
def create_job(
	job_name: str = typer.Argument(..., help="Job package name under jobs/ (e.g. mlp_v2)."),
	kind: JobKind = typer.Option(
		JobKind.job,
		"--kind",
		help="Scaffold kind: job (plain) or trainer (ML training loop).",
		case_sensitive=False,
	),
	force: bool = typer.Option(False, "--force", help="Overwrite scaffold files if they already exist."),
) -> None:
	"""Create a new job package with starter files under jobs/<name>/."""
	try:
		created = create_job_package(job_name, kind=kind.value, force=force)
	except (ValueError, FileExistsError) as exc:
		raise typer.BadParameter(str(exc)) from exc

	typer.echo(f"Created job scaffold: {created}")


def main() -> None:
	app()
