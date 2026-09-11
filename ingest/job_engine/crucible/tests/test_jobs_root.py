from pathlib import Path
import pytest
from crucible.core.constants import JOBS_ROOT_NAME, JOBS_ROOT
import crucible.core.constants as constants
from crucible.interface.cli import utils as cli_utils

def test_jobs_root_name_constant_default():
    assert JOBS_ROOT_NAME == "jobs"
    assert JOBS_ROOT.name == JOBS_ROOT_NAME

def test_create_job_package_creates_jobs_root(tmp_path, monkeypatch):
    # Change JOBS_ROOT and JOBS_ROOT_NAME to a temp dir
    monkeypatch.setattr(constants, "JOBS_ROOT_NAME", "custom_jobs")
    custom_root = tmp_path / "custom_jobs"
    monkeypatch.setattr(constants, "JOBS_ROOT", custom_root)
    monkeypatch.setattr(cli_utils, "JOBS_ROOT", custom_root)
    assert not custom_root.exists()
    # Should create the root and the job dir
    job_dir = cli_utils.create_job_package("test_exp", force=True)
    assert custom_root.exists()
    assert (custom_root / "test_exp").exists()
    assert (custom_root / "test_exp" / "configs").exists()
    assert (custom_root / "test_exp" / "outputs").exists()

def test_create_job_package_does_not_remove_existing_jobs_root(tmp_path, monkeypatch):
    # Setup: create a custom jobs root with a pre-existing subfolder
    monkeypatch.setattr(constants, "JOBS_ROOT_NAME", "custom_jobs")
    custom_root = tmp_path / "custom_jobs"
    monkeypatch.setattr(constants, "JOBS_ROOT", custom_root)
    monkeypatch.setattr(cli_utils, "JOBS_ROOT", custom_root)
    custom_root.mkdir(parents=True, exist_ok=True)
    preexisting = custom_root / "preexisting_job_folder"
    preexisting.mkdir()
    (preexisting / "keep.txt").write_text("keep this file")
    # Act: create a new job package
    cli_utils.create_job_package("test_exp2", force=True)
    # Assert: preexisting subfolder and file are untouched
    assert preexisting.exists()
    assert (preexisting / "keep.txt").exists()
    assert (custom_root / "test_exp2").exists()
    assert (custom_root / "test_exp2" / "configs").exists()
    assert (custom_root / "test_exp2" / "outputs").exists()
