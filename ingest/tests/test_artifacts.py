from pathlib import Path
import pytest
from bibleit_ingest.artifacts import (
    load_chunks_artifact,
    read_lock_file,
    resolve_matching_artifacts,
    save_chunks_artifact,
    write_lock_file,
)
from bibleit_ingest.types import ChunkConfig, Passage


def test_write_and_read_lock_file(tmp_path: Path) -> None:
    lock_path = tmp_path / "config.lock.yaml"
    data = {
        "stage": "chunking",
        "hash": "a1b2c3d4e5f6",
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
    assert loaded["hash"] == "a1b2c3d4e5f6"
    assert loaded["parameters"]["floor"] == 5


def test_resolve_matching_artifacts(tmp_path: Path) -> None:
    run_dir1 = tmp_path / "run_1"
    write_lock_file(
        run_dir1 / "config.lock.yaml",
        {
            "hash": "hash_aaa",
            "parameters": {
                "floor": 5,
                "ceiling": 30,
            },
        },
    )

    run_dir2 = tmp_path / "run_2"
    write_lock_file(
        run_dir2 / "config.lock.yaml",
        {
            "hash": "hash_bbb",
            "parameters": {
                "floor": 5,
                "ceiling": 30,
            },
        },
    )

    # Match against hash_bbb
    matched = resolve_matching_artifacts(tmp_path, "hash_bbb")
    assert matched == run_dir2

    # Match against hash_aaa
    matched1 = resolve_matching_artifacts(tmp_path, "hash_aaa")
    assert matched1 == run_dir1

    # Non-existent hash
    assert resolve_matching_artifacts(tmp_path, "nonexistent_hash") is None


def test_chunk_config_properties() -> None:
    tok_cfg = ChunkConfig(
        strategy="token_window",
        ceiling=256,
        overlap=1,
        include_overlap_heading=True,
        render_strategy="book_and_heading",
    )
    assert len(tok_cfg.content_hash) == 12
    assert tok_cfg.slug == f"{tok_cfg.content_hash}_tok_c256_o1_ovh1_book_heading"
    assert tok_cfg.canonical_dict["strategy"] == "token_window"
    assert tok_cfg.canonical_dict["ceiling"] == 256

    # When overlap is 0, ovh flag is omitted from slug
    tok_no_ovh = ChunkConfig(
        strategy="token_window",
        ceiling=256,
        overlap=0,
        render_strategy="book_and_heading",
    )
    assert tok_no_ovh.slug == f"{tok_no_ovh.content_hash}_tok_c256_o0_book_heading"

    # Pericope strategy slug
    peri_cfg = ChunkConfig(strategy="pericope", ceiling=30, overlap=0, render_strategy="text_only")
    assert peri_cfg.slug == f"{peri_cfg.content_hash}_peri_c30_o0_text"

    # Adaptive strategy slug
    adapt_cfg = ChunkConfig(strategy="adaptive", floor=5, ceiling=30, overlap=2, include_overlap_heading=False)
    assert adapt_cfg.slug == f"{adapt_cfg.content_hash}_f5_c30_o2_ovh0_heading"


def test_chunk_config_hash_determinism_and_sensitivity() -> None:
    base = ChunkConfig(strategy="token_window", ceiling=256, overlap=1, headroom_margin=25)
    same = ChunkConfig(strategy="token_window", ceiling=256, overlap=1, headroom_margin=25)
    assert base.content_hash == same.content_hash

    # Sensitivity: any parameter change must produce a distinct hash
    diff_ceiling = ChunkConfig(strategy="token_window", ceiling=512, overlap=1, headroom_margin=25)
    diff_overlap = ChunkConfig(strategy="token_window", ceiling=256, overlap=0, headroom_margin=25)
    diff_margin = ChunkConfig(strategy="token_window", ceiling=256, overlap=1, headroom_margin=30)
    diff_render = ChunkConfig(strategy="token_window", ceiling=256, overlap=1, render_strategy="text_only")

    hashes = {
        base.content_hash,
        diff_ceiling.content_hash,
        diff_overlap.content_hash,
        diff_margin.content_hash,
        diff_render.content_hash,
    }
    assert len(hashes) == 5


def test_save_and_load_chunks_artifact(tmp_path: Path) -> None:
    chunks = [
        Passage(book="GEN", start=(1, 1), end=(1, 5), headings=((1, 1, "Creation"),)),
        Passage(book="PHP", start=(4, 4), end=(4, 7), headings=((4, 4, "Rejoice"),)),
    ]
    path = save_chunks_artifact(tmp_path / "chunks.json", chunks)
    loaded = load_chunks_artifact(path)
    assert loaded == chunks

