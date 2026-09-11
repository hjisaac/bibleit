import ast
import logging
import sys
from textwrap import dedent
from pathlib import Path

import pytest
from typer import Typer
from typer.testing import CliRunner

import crucible.interface.cli.cli as ui_cli
import crucible.interface.cli.utils as ui_utils
from crucible.core.constants import JOBS_ROOT
from crucible.core import constants
from crucible.core.config import loader
from crucible.core.runtime import discovery

from omegaconf import OmegaConf


def _clear_jobs_modules() -> None:
	for module_name in list(sys.modules):
		if module_name == "jobs" or module_name.startswith("jobs."):
			del sys.modules[module_name]


__JOB_SOURCE = dedent(
	"""
	from crucible.core.jobs import AbstractJob

	class Job(AbstractJob):
	    def on_prepare(self) -> None:
	        self.data = {'message': self.config['message']}

	    def on_execute(self) -> dict[str, str]:
	        return {
	            'status': 'ok',
	            'message': self.data['message'],
	            'log_dir': self.config['log_dir'],
	        }

	JOB_CLASS = Job
	"""
)


def _write_demo_job_package(tmp_path: Path) -> Path:
	jobs_root = tmp_path / "jobs"
	job_dir = jobs_root / "demo"
	config_dir = job_dir / "configs"
	config_dir.mkdir(parents=True)

	(jobs_root / "__init__.py").write_text("", encoding="utf-8")
	(job_dir / "__init__.py").write_text(
		"from .job import Job, JOB_CLASS\n"
		"__all__ = ['Job', 'JOB_CLASS']\n",
		encoding="utf-8",
	)
	(job_dir / "job.py").write_text(__JOB_SOURCE, encoding="utf-8")

	log_dir = tmp_path / "runtime-logs"
	(config_dir / "default.yaml").write_text(
		dedent(
			f"""
			log_dir: {log_dir.as_posix()}
			log_console_level: INFO
			log_file_level: DEBUG
			message: base
			"""
		).lstrip(),
		encoding="utf-8",
	)

	return jobs_root


def _assert_generated_package_is_valid(created: Path) -> None:
	ast.parse((created / "__init__.py").read_text(encoding="utf-8"))
	ast.parse((created / "job.py").read_text(encoding="utf-8"))
	OmegaConf.create((created / "configs" / "default.yaml").read_text(encoding="utf-8"))


@pytest.fixture
def demo_job_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
	jobs_root = _write_demo_job_package(tmp_path)
	monkeypatch.syspath_prepend(str(tmp_path))
	monkeypatch.setattr(constants, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(loader, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)
	_clear_jobs_modules()
	return tmp_path


def test_run_named_job_loads_config_applies_overrides_and_logs(demo_job_environment: Path, caplog) -> None:
	tmp_path = demo_job_environment

	with caplog.at_level(logging.WARNING, logger="core.runtime.execution"):
		result = ui_utils.run_named_job("demo", "default", overrides=["message=overridden"])

	assert result == {
		"status": "ok",
		"message": "overridden",
		"log_dir": str((tmp_path / "runtime-logs").as_posix()),
	}
	assert "Runtime config for job='demo'" in caplog.text
	assert "overrides=message=overridden" in caplog.text
	assert "message: overridden" in caplog.text


def test_cli_command_runs_temp_pipeline_with_config_and_override(demo_job_environment: Path) -> None:

	app = Typer()
	app.command(name="demo")(ui_cli._build_run_command("demo"))

	runner = CliRunner()
	result = runner.invoke(app, ["--config", "default", "-o", "message=from_cli"])

	assert result.exit_code == 0
	assert "from_cli" in result.output
	assert "status" in result.output


def test_list_available_jobs_reads_temp_jobs_folder(tmp_path, monkeypatch) -> None:
	jobs_root = _write_demo_job_package(tmp_path)
	monkeypatch.setattr(constants, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)
	monkeypatch.setattr(discovery, "JOBS_ROOT", jobs_root)

	assert ui_utils.list_available_jobs() == ["demo"]


def test_create_job_package_plain_creates_expected_structure(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	created = ui_utils.create_job_package("vision_mlp", kind="job")

	assert created == jobs_root / "vision_mlp"
	assert (created / "__init__.py").exists()
	assert (created / "job.py").exists()
	assert (created / "README.md").exists()
	assert (created / "ARTICLE.md").exists()
	assert (created / "configs" / "default.yaml").exists()

	init_source = (created / "__init__.py").read_text(encoding="utf-8")
	assert "from .job import JOB_CLASS, Job" in init_source
	assert '__all__ = ["Job", "JOB_CLASS"]' in init_source

	job_source = (created / "job.py").read_text(encoding="utf-8")
	assert "class Job(AbstractJob):" in job_source
	assert 'return {"status": "ok", "job": "vision_mlp", "kind": "job"}' in job_source

	config_source = (created / "configs" / "default.yaml").read_text(encoding="utf-8")
	assert "log_dir: logs" in config_source
	assert "log_console_level: INFO" in config_source
	assert "log_file_level: DEBUG" in config_source

	article_source = (created / "ARTICLE.md").read_text(encoding="utf-8")
	assert article_source.startswith("---\n")
	assert "published: false" in article_source
	assert "job 'vision_mlp'" in article_source
	_assert_generated_package_is_valid(created)


def test_create_job_package_trainer_creates_expected_structure(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	created = ui_utils.create_job_package("vision_trainer", kind="trainer")

	job_source = (created / "job.py").read_text(encoding="utf-8")
	assert "class Job(AbstractTrainerJob):" in job_source
	assert 'return {"status": "ok", "job": "vision_trainer", "kind": "trainer"}' in job_source
	_assert_generated_package_is_valid(created)


def test_create_job_package_normalizes_name_to_lowercase(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	created = ui_utils.create_job_package("Vision_MLP", kind="job")

	assert created == jobs_root / "vision_mlp"
	assert created.exists()


def test_create_job_package_rejects_reserved_name(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	with pytest.raises(ValueError, match="reserved by the CLI"):
		ui_utils.create_job_package("create", kind="job")


def test_create_job_package_force_overwrites_files(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	created = ui_utils.create_job_package("vision_force", kind="job")
	(created / "job.py").write_text("sentinel\n", encoding="utf-8")

	ui_utils.create_job_package("vision_force", kind="trainer", force=True)

	job_source = (created / "job.py").read_text(encoding="utf-8")
	assert "AbstractTrainerJob" in job_source
	_assert_generated_package_is_valid(created)


def test_cli_create_command_creates_plain_job_scaffold(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	jobs_root.mkdir(parents=True)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["create", "demo_new", "--kind", "job"])

	assert result.exit_code == 0
	assert "Created job scaffold:" in result.output
	assert (jobs_root / "demo_new" / "job.py").exists()
	assert "AbstractJob" in (jobs_root / "demo_new" / "job.py").read_text(encoding="utf-8")
	_assert_generated_package_is_valid(jobs_root / "demo_new")


def test_cli_create_command_creates_trainer_scaffold(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	jobs_root.mkdir(parents=True)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["create", "demo_train", "--kind", "trainer"])

	assert result.exit_code == 0
	assert "Created job scaffold:" in result.output
	assert (jobs_root / "demo_train" / "job.py").exists()
	assert "AbstractTrainerJob" in (jobs_root / "demo_train" / "job.py").read_text(encoding="utf-8")
	_assert_generated_package_is_valid(jobs_root / "demo_train")


def test_cli_create_command_defaults_to_plain_job(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	jobs_root.mkdir(parents=True)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["create", "demo_default"])

	assert result.exit_code == 0
	assert "AbstractJob" in (jobs_root / "demo_default" / "job.py").read_text(encoding="utf-8")
	assert "AbstractTrainerJob" not in (jobs_root / "demo_default" / "job.py").read_text(encoding="utf-8")
	_assert_generated_package_is_valid(jobs_root / "demo_default")


def test_cli_create_command_accepts_case_insensitive_kind(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	jobs_root.mkdir(parents=True)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["create", "demo_caps", "--kind", "TRAINER"])

	assert result.exit_code == 0
	assert "AbstractTrainerJob" in (jobs_root / "demo_caps" / "job.py").read_text(encoding="utf-8")
	_assert_generated_package_is_valid(jobs_root / "demo_caps")


def test_cli_create_command_rejects_reserved_name(tmp_path, monkeypatch) -> None:
	jobs_root = tmp_path / "jobs"
	jobs_root.mkdir(parents=True)
	monkeypatch.setattr(ui_utils, "JOBS_ROOT", jobs_root)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["create", "execute"])

	assert result.exit_code != 0
	assert "reserved by the CLI" in result.output


def test_cli_execute_subcommand_forwards_args(monkeypatch) -> None:
	captured: dict[str, object] = {}

	def _fake_run_named_job(job_name: str, config_name: str, overrides: list[str] | None = None):
		captured["job_name"] = job_name
		captured["config_name"] = config_name
		captured["overrides"] = overrides
		return {"status": "ok"}

	monkeypatch.setattr(ui_cli, "run_named_job", _fake_run_named_job)

	runner = CliRunner()
	result = runner.invoke(ui_cli.app, ["execute", "demo", "--config", "default", "-o", "a=b", "-o", "c=d"])

	assert result.exit_code == 0
	assert captured == {
		"job_name": "demo",
		"config_name": "default",
		"overrides": ["a=b", "c=d"],
	}
	assert "status" in result.output