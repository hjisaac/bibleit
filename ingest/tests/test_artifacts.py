from pathlib import Path
from bibleit_ingest.artifacts import find_matching_artifact, read_lock_file, write_lock_file


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


def test_find_matching_artifact(tmp_path: Path) -> None:
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
    matched = find_matching_artifact(
        tmp_path,
        {"floor": 5, "ceiling": 30, "overlap": 1, "render_strategy": "heading_and_text"},
    )
    assert matched == run_dir2

    # Match criteria against run 1
    matched1 = find_matching_artifact(
        tmp_path,
        {"overlap": 0, "render_strategy": "text_only"},
    )
    assert matched1 == run_dir1

    # Non-existent criteria
    assert find_matching_artifact(tmp_path, {"floor": 99}) is None
