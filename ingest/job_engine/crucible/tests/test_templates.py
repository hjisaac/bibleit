import shutil
from pathlib import Path

import pytest

import crucible.interface.cli.utils as ui_utils

REAL_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "interface" / "cli" / "templates"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "templates"

SAMPLE_JOB_NAME = "test_job"


# ---------------------------------------------------------------------------
# Real templates: _validate_rendered_template must accept them without error.
# If someone commits a broken template this test will catch it.
# ---------------------------------------------------------------------------


def test_validate_accepts_plain_job_template() -> None:
	rendered = ui_utils._render_template("job_plain.py.tpl", job_name=SAMPLE_JOB_NAME)
	ui_utils._validate_rendered_template("job_plain.py.tpl", rendered)


def test_validate_accepts_trainer_job_template() -> None:
	rendered = ui_utils._render_template("job_trainer.py.tpl", job_name=SAMPLE_JOB_NAME)
	ui_utils._validate_rendered_template("job_trainer.py.tpl", rendered)


def test_validate_accepts_init_template() -> None:
	rendered = ui_utils._render_template("__init__.py.tpl")
	ui_utils._validate_rendered_template("__init__.py.tpl", rendered)


def test_validate_accepts_default_yaml_template() -> None:
	rendered = ui_utils._render_template("default.yaml.tpl")
	ui_utils._validate_rendered_template("default.yaml.tpl", rendered)


def test_validate_accepts_article_template() -> None:
	rendered = ui_utils._render_template("article.md.tpl", job_name=SAMPLE_JOB_NAME, date="2026-01-01")
	ui_utils._validate_rendered_template("article.md.tpl", rendered)


# ---------------------------------------------------------------------------
# Broken fixture templates: _validate_rendered_template must reject them.
# Confirms the validator actually catches problems, not just silently passes.
# ---------------------------------------------------------------------------


def test_validate_rejects_broken_python_template() -> None:
	tpl = (FIXTURES_DIR / "broken_python.py.tpl").read_text(encoding="utf-8")
	rendered = tpl.format(job_name=SAMPLE_JOB_NAME)
	with pytest.raises(ValueError, match="not valid Python"):
		ui_utils._validate_rendered_template("job_plain.py.tpl", rendered)


def test_validate_rejects_broken_yaml_template() -> None:
	tpl = (FIXTURES_DIR / "broken_yaml.yaml.tpl").read_text(encoding="utf-8")
	with pytest.raises(ValueError, match="not valid YAML"):
		ui_utils._validate_rendered_template("default.yaml.tpl", tpl)


# ---------------------------------------------------------------------------
# Integration: create_job_package must call _validate_rendered_template.
# Proven by giving it a broken template and asserting no files are written.
# ---------------------------------------------------------------------------


def _build_template_dir(tmp_path: Path, *, replace: dict[str, Path]) -> Path:
	"""Copy real templates into tmp_path, swapping in broken fixtures by name."""
	tpl_dir = tmp_path / "templates"
	shutil.copytree(REAL_TEMPLATES_DIR, tpl_dir)
	for name, broken_path in replace.items():
		(tpl_dir / name).write_text(broken_path.read_text(encoding="utf-8"), encoding="utf-8")
	return tpl_dir


def test_create_job_package_fails_and_writes_nothing_on_broken_python_template(
	tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
	jobs_root = tmp_path / "jobs"
	tpl_dir = _build_template_dir(
		tmp_path, replace={"job_plain.py.tpl": FIXTURES_DIR / "broken_python.py.tpl"}
	)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(ui_utils, "TEMPLATES_DIR", tpl_dir)

	with pytest.raises(ValueError, match="not valid Python"):
		ui_utils.create_job_package("my_exp", kind="job")

	assert not (jobs_root / "my_exp" / "job.py").exists()


def test_create_job_package_fails_and_writes_nothing_on_broken_yaml_template(
	tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
	jobs_root = tmp_path / "jobs"
	tpl_dir = _build_template_dir(
		tmp_path, replace={"default.yaml.tpl": FIXTURES_DIR / "broken_yaml.yaml.tpl"}
	)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(ui_utils, "TEMPLATES_DIR", tpl_dir)

	with pytest.raises(ValueError, match="not valid YAML"):
		ui_utils.create_job_package("my_exp", kind="job")

	assert not (jobs_root / "my_exp" / "configs" / "default.yaml").exists()
