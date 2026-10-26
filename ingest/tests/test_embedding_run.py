from pathlib import Path

import numpy as np
import pytest

from bibleit_ingest.artifacts import load_embedding_run, save_chunks_artifact, write_lock_file
from bibleit_ingest.types import Passage

CHUNKS = [Passage(book="GEN", start=(1, 1), end=(1, 2), headings=())]


def _make_run(root: Path, name: str, model: str, rows: int = 1, h: str = "abc123abc123") -> Path:
    run_dir = root / name
    save_chunks_artifact(run_dir / "chunks.json", CHUNKS)
    np.save(run_dir / "embeddings.npy", np.ones((rows, 4)))
    write_lock_file(run_dir / "config.lock.yaml", {
        "hash": h,
        "parameters": {"embedding_model": model},
        "output": {"shape": [rows, 4]},
        "upstream": {"parameters": {"strategy": "token_window", "ceiling": 512}},
    })
    return run_dir


def test_loads_run_by_hash(tmp_path: Path) -> None:
    _make_run(tmp_path, "r1", "m-a")
    run = load_embedding_run(tmp_path, "abc123abc123")
    assert run.model == "m-a"
    assert run.chunk_params == {"strategy": "token_window", "ceiling": 512}
    assert run.embeddings.shape == (1, 4)


def test_unknown_hash_raises(tmp_path: Path) -> None:
    _make_run(tmp_path, "r1", "m-a")
    with pytest.raises(FileNotFoundError):
        load_embedding_run(tmp_path, "ffffffffffff")


def test_same_hash_different_models_is_ambiguous(tmp_path: Path) -> None:
    _make_run(tmp_path, "r1", "m-a")
    _make_run(tmp_path, "r2", "m-b")
    with pytest.raises(ValueError, match="models"):
        load_embedding_run(tmp_path, "abc123abc123")
    assert load_embedding_run(tmp_path, "abc123abc123", model="m-b").model == "m-b"


def test_row_count_mismatch_raises(tmp_path: Path) -> None:
    _make_run(tmp_path, "r1", "m-a", rows=2)
    with pytest.raises(ValueError):
        load_embedding_run(tmp_path, "abc123abc123")
