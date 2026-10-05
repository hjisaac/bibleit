from pathlib import Path
import pytest

from bibleit_ingest.chunking import (
    Chunk,
    FloorCeilingMergeChunker,
    Pericope,
    group_verse_addresses_by_book,
    index_verses_by_address,
    render_chunk_text,
)


def test_chunker_validation() -> None:
    with pytest.raises(ValueError, match="floor and ceiling must be positive"):
        FloorCeilingMergeChunker(floor=0, ceiling=10)

    with pytest.raises(ValueError, match="floor and ceiling must be positive"):
        FloorCeilingMergeChunker(floor=-2, ceiling=10)

    with pytest.raises(ValueError, match="floor cannot exceed ceiling"):
        FloorCeilingMergeChunker(floor=15, ceiling=10)


def test_chunker_merging_forward() -> None:
    chunker = FloorCeilingMergeChunker(floor=5, ceiling=15)
    pericopes = [
        Pericope(book="GEN", chapter=1, verse=1, heading="Heading 1", verse_count=2),
        Pericope(book="GEN", chapter=1, verse=3, heading="Heading 2", verse_count=4),
        Pericope(book="GEN", chapter=1, verse=7, heading="Heading 3", verse_count=8),
    ]
    chunks = chunker.chunk(pericopes)

    # First two pericopes (2 + 4 = 6 >= floor 5) merge together
    # Third pericope (8 >= floor 5) stands alone
    assert len(chunks) == 2
    assert chunks[0].verse_count == 6
    assert chunks[0].headings == ["Heading 1", "Heading 2"]
    assert chunks[0].book == "GEN"

    assert chunks[1].verse_count == 8
    assert chunks[1].headings == ["Heading 3"]


def test_chunker_backward_merge_last_pericope() -> None:
    chunker = FloorCeilingMergeChunker(floor=5, ceiling=15)
    pericopes = [
        Pericope(book="EXO", chapter=1, verse=1, heading="P1", verse_count=8),
        Pericope(book="EXO", chapter=1, verse=9, heading="P2", verse_count=2),  # undersized at end
    ]
    chunks = chunker.chunk(pericopes)

    # 8 + 2 = 10 <= ceiling 15, merges backward into previous chunk
    assert len(chunks) == 1
    assert chunks[0].verse_count == 10
    assert chunks[0].headings == ["P1", "P2"]


def test_chunker_backward_merge_exceeding_ceiling() -> None:
    chunker = FloorCeilingMergeChunker(floor=5, ceiling=10)
    pericopes = [
        Pericope(book="EXO", chapter=1, verse=1, heading="P1", verse_count=9),
        Pericope(book="EXO", chapter=1, verse=10, heading="P2", verse_count=2),  # 9 + 2 = 11 > 10
    ]
    chunks = chunker.chunk(pericopes)

    # Cannot merge backward without exceeding ceiling 10, so stands alone
    assert len(chunks) == 2
    assert chunks[0].verse_count == 9
    assert chunks[1].verse_count == 2


def test_index_and_render_chunk_text() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "In the beginning,"),
        (("GEN", 1, 2), "the earth was formless."),
        (("GEN", 1, 3), "God said, Let there be light."),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    assert addr_index[("GEN", 1, 1)] == 0
    assert addr_index[("GEN", 1, 3)] == 2

    grouped = group_verse_addresses_by_book(ordered_verses)
    assert "GEN" in grouped
    assert len(grouped["GEN"]) == 3

    p = Pericope(book="GEN", chapter=1, verse=1, heading="Creation", verse_count=2)
    chunk = Chunk(pericopes=[p])

    rendered = render_chunk_text(chunk, ordered_verses, addr_index)
    assert rendered == "Creation\nIn the beginning, the earth was formless."
