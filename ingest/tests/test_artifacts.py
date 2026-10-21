from pathlib import Path
import pytest
from bibleit_ingest.artifacts import (
    extract_chunk_criteria,
    format_chunk_slug,
    load_chunks_artifact,
    read_lock_file,
    resolve_matching_artifacts,
    save_chunks_artifact,
    write_lock_file,
)
from bibleit_ingest.types import Passage


def test_write_and_read_lock_file(tmp_path: Path) -> None:
    lock_path = tmp_path / "config.lock.yaml"
    data = {
        "stage": "chunking",
        "parameters": {
            "floor": 5,
            "ceiling": 30,
            "overlap": 1,
            "render_strategy": "heading_and_text",
        },
        "output": {
            "total_chunks": 2581,
        },
    }
    written = write_lock_file(lock_path, data)
    assert written.exists()

    # Verify read-only permission (0o444)
    mode = oct(written.stat().st_mode & 0o777)
    assert mode == "0o444"

    loaded = read_lock_file(written)
    assert loaded["stage"] == "chunking"
    assert loaded["parameters"]["floor"] == 5


def test_resolve_matching_artifacts(tmp_path: Path) -> None:
    run_dir1 = tmp_path / "run_1"
    write_lock_file(
        run_dir1 / "config.lock.yaml",
        {
            "parameters": {
                "floor": 5,
                "ceiling": 30,
                "overlap": 0,
                "render_strategy": "text_only",
            }
        },
    )

    run_dir2 = tmp_path / "run_2"
    write_lock_file(
        run_dir2 / "config.lock.yaml",
        {
            "parameters": {
                "floor": 5,
                "ceiling": 30,
                "overlap": 1,
                "render_strategy": "heading_and_text",
            }
        },
    )

    # Match criteria against run 2
    matched = resolve_matching_artifacts(
        tmp_path,
        {"floor": 5, "ceiling": 30, "overlap": 1, "render_strategy": "heading_and_text"},
    )
    assert matched == run_dir2

    # Match criteria against run 1
    matched1 = resolve_matching_artifacts(
        tmp_path,
        {"overlap": 0, "render_strategy": "text_only"},
    )
    assert matched1 == run_dir1

    # Non-existent criteria value
    assert resolve_matching_artifacts(tmp_path, {"floor": 99}) is None

    # Criterion key not present in lock file
    assert resolve_matching_artifacts(tmp_path, {"nonexistent_key": "val"}) is None


def test_format_chunk_slug_and_extract_criteria() -> None:
    tok_cfg = {
        "strategy": "token_window",
        "ceiling": 256,
        "overlap": 1,
        "include_overlap_heading": True,
        "render_strategy": "book_and_heading",
    }
    assert format_chunk_slug(tok_cfg) == "tok_c256_o1_ovh1_book_heading"
    assert extract_chunk_criteria(tok_cfg) == {
        "strategy": "token_window",
        "ceiling": 256,
        "overlap": 1,
        "include_overlap_heading": True,
        "render_strategy": "book_and_heading",
    }

    # When overlap is 0, include_overlap_heading is omitted from slug and criteria
    tok_no_ovh = {**tok_cfg, "overlap": 0}
    assert format_chunk_slug(tok_no_ovh) == "tok_c256_o0_book_heading"
    assert "include_overlap_heading" not in extract_chunk_criteria(tok_no_ovh)

    with pytest.raises(KeyError):
        extract_chunk_criteria({"ceiling": 256})


def test_save_and_load_chunks_artifact(tmp_path: Path) -> None:
    chunks = [
        Passage(book="GEN", start=(1, 1), end=(1, 5), headings=((1, 1, "Creation"),)),
        Passage(book="PHP", start=(4, 4), end=(4, 7), headings=((4, 4, "Rejoice"),)),
    ]
    path = save_chunks_artifact(tmp_path / "chunks.json", chunks)
    loaded = load_chunks_artifact(path)
    assert loaded == chunks

