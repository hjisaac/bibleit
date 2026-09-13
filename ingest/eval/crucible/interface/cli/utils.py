import ast
import re
from pathlib import Path

from omegaconf import OmegaConf

from crucible.core.constants import JOBS_ROOT
from crucible.core.runtime.discovery import list_available_jobs
from crucible.core.runtime.execution import run_named_job

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
JOB_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
JOB_TEMPLATE = "job_plain.py.tpl"


def _normalize_job_name(job_name: str) -> str:
	normalized = job_name.strip().lower()
	if not normalized:
		raise ValueError("Job name cannot be empty.")
	if normalized in {"list", "execute", "create"}:
		raise ValueError(f"Job name '{normalized}' is reserved by the CLI.")
	if not JOB_NAME_PATTERN.match(normalized):
		raise ValueError(
			"Job name must match ^[a-z][a-z0-9_]*$ (lowercase letters, numbers, underscore)."
		)
	return normalized


def _write_scaffold_file(path: Path, content: str, force: bool) -> None:
	if path.exists() and not force:
		raise FileExistsError(f"File already exists: {path}")
	path.write_text(content, encoding="utf-8")


def _render_template(template_name: str, **kwargs: str) -> str:
	template_path = TEMPLATES_DIR / template_name
	if not template_path.exists():
		raise FileNotFoundError(f"Template file was not found: {template_path}")
	template = template_path.read_text(encoding="utf-8")
	return template.format(**kwargs)


def _validate_rendered_template(template_name: str, rendered_content: str) -> None:
	try:
		if template_name.endswith(".py.tpl"):
			ast.parse(rendered_content)
		elif template_name.endswith((".yaml.tpl", ".yml.tpl")):
			OmegaConf.create(rendered_content)
	except SyntaxError as exc:
		raise ValueError(f"Rendered template '{template_name}' is not valid Python.") from exc
	except Exception as exc:
		raise ValueError(f"Rendered template '{template_name}' is not valid YAML.") from exc


def create_job_package(job_name: str, *, force: bool = False) -> Path:
	job_name = _normalize_job_name(job_name)
	# Ensure the jobs root directory exists (create if missing)
	if not JOBS_ROOT.exists():
		JOBS_ROOT.mkdir(parents=True, exist_ok=True)
	job_dir = JOBS_ROOT / job_name

	if job_dir.exists() and not force:
		raise FileExistsError(f"Job folder already exists: {job_dir}")

	configs_dir = job_dir / "configs"
	configs_dir.mkdir(parents=True, exist_ok=True)
	job_source = _render_template(JOB_TEMPLATE, job_name=job_name)
	_validate_rendered_template(JOB_TEMPLATE, job_source)

	init_source = _render_template("__init__.py.tpl")
	_validate_rendered_template("__init__.py.tpl", init_source)

	default_config_source = _render_template("default.yaml.tpl")
	_validate_rendered_template("default.yaml.tpl", default_config_source)

	_write_scaffold_file(job_dir / "__init__.py", init_source, force)
	_write_scaffold_file(job_dir / "job.py", job_source, force)
	_write_scaffold_file(
		configs_dir / "default.yaml",
		default_config_source,
		force,
	)

	return job_dir
