import typer

from crucible.interface.cli.utils import create_job_package, list_available_jobs, run_named_job

app = typer.Typer(
	no_args_is_help=True,
	help="Discover and run crucible jobs defined under jobs/.",
	pretty_exceptions_enable=False,
)


def _run_command(job_name: str, config: str = "default", overrides: list[str] | None = None) -> None:
	result = run_named_job(job_name, config, overrides=overrides)
	if result is not None:
		typer.echo(result)


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
		help="YAML config name under jobs/<job>/configs, with or without extension.",
	),
	overrides: list[str] = typer.Option(
		None,
		"--override",
		"-o",
		help="Hydra-style override(s), e.g. -o k=10 (repeat flag for multiple).",
	),
) -> None:
	"""Execute a discovered crucible job by name (produces one run)."""
	_run_command(job_name, config, overrides=overrides)


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
