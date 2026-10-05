from pathlib import Path
import pytest

from bibleit_ingest.chunking import (
    AdaptiveWindowChunker,
    Chunk,
    ChunkRenderer,
    Pericope,
    index_verses_by_address,
    load_pericopes,
    render_chunk_text,
)
from bibleit_ingest.constants import BSB_PERICOPES_PATH


def test_chunker_validation() -> None:
    with pytest.raises(ValueError, match="floor and ceiling must be positive"):
        AdaptiveWindowChunker(floor=0, ceiling=10)

    with pytest.raises(ValueError, match="floor and ceiling must be positive"):
        AdaptiveWindowChunker(floor=-2, ceiling=10)

    with pytest.raises(ValueError, match="floor cannot exceed ceiling"):
        AdaptiveWindowChunker(floor=15, ceiling=10)

    with pytest.raises(ValueError, match="overlap cannot be negative"):
        AdaptiveWindowChunker(floor=5, ceiling=10, overlap=-1)


def test_chunker_merging_forward() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=0)
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
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=0)
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
    chunker = AdaptiveWindowChunker(floor=5, ceiling=10, overlap=0)
    pericopes = [
        Pericope(book="EXO", chapter=1, verse=1, heading="P1", verse_count=9),
        Pericope(book="EXO", chapter=1, verse=10, heading="P2", verse_count=2),  # 9 + 2 = 11 > 10
    ]
    chunks = chunker.chunk(pericopes)

    # Cannot merge backward without exceeding ceiling 10, so stands alone
    assert len(chunks) == 2
    assert chunks[0].verse_count == 9
    assert chunks[1].verse_count == 2


def test_chunker_overlap() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=20, overlap=3)
    pericopes = [
        Pericope(book="GEN", chapter=1, verse=1, heading="P1", verse_count=6),
        Pericope(book="GEN", chapter=1, verse=7, heading="P2", verse_count=7),
        Pericope(book="GEN", chapter=1, verse=14, heading="P3", verse_count=8),
    ]
    chunks = chunker.chunk(pericopes)

    assert len(chunks) == 3
    assert chunks[0].headings == ["P1"]
    assert chunks[0].verse_count == 6

    # Chunk 1 starts with 3 overlap verses from P1 (verse 1 + 6 - 3 = 4)
    assert chunks[1].headings == ["P1", "P2"]
    assert chunks[1].verse_count == 10  # 3 overlap + 7 fresh
    assert chunks[1].pericopes[0].is_overlap is True
    assert chunks[1].pericopes[0].verse == 4
    assert chunks[1].pericopes[0].verse_count == 3
    assert chunks[1].pericopes[1].is_overlap is False

    # Chunk 2 starts with 3 overlap verses from P2 (verse 7 + 7 - 3 = 11)
    assert chunks[2].headings == ["P2", "P3"]
    assert chunks[2].verse_count == 11  # 3 overlap + 8 fresh
    assert chunks[2].pericopes[0].is_overlap is True
    assert chunks[2].pericopes[0].verse == 11
    assert chunks[2].pericopes[0].verse_count == 3


def test_chunker_overlap_skips_when_exceeding_ceiling() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=4)
    pericopes = [
        Pericope(book="GEN", chapter=1, verse=1, heading="P1", verse_count=12),
        Pericope(book="GEN", chapter=1, verse=13, heading="P2", verse_count=12),
    ]
    chunks = chunker.chunk(pericopes)

    # 4 overlap + 12 fresh = 16 > 15 ceiling: overlap prefix skipped
    assert len(chunks) == 2
    assert chunks[0].headings == ["P1"]
    assert chunks[1].headings == ["P2"]


def test_index_and_render_chunk_text() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "In the beginning,"),
        (("GEN", 1, 2), "the earth was formless."),
        (("GEN", 1, 3), "God said, Let there be light."),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    assert addr_index[("GEN", 1, 1)] == 0
    assert addr_index[("GEN", 1, 3)] == 2

    p = Pericope(book="GEN", chapter=1, verse=1, heading="Creation", verse_count=2)
    chunk = Chunk(pericopes=[p])

    rendered = render_chunk_text(chunk, ordered_verses, addr_index)
    assert rendered == "Creation\nIn the beginning, the earth was formless."


def test_chunk_renderer_overlap_heading() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "Verse 1"),
        (("GEN", 1, 2), "Verse 2"),
        (("GEN", 1, 3), "Verse 3"),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    chunk = Chunk(
        pericopes=[
            Pericope(book="GEN", chapter=1, verse=1, heading="Heading 1", verse_count=1, is_overlap=True),
            Pericope(book="GEN", chapter=1, verse=2, heading="Heading 2", verse_count=2, is_overlap=False),
        ]
    )

    renderer_with = ChunkRenderer(ordered_verses, addr_index, include_overlap_headings=True)
    assert renderer_with.render(chunk) == "Heading 1\nVerse 1\n\nHeading 2\nVerse 2 Verse 3"

    renderer_without = ChunkRenderer(ordered_verses, addr_index, include_overlap_headings=False)
    assert renderer_without.render(chunk) == "Verse 1\n\nHeading 2\nVerse 2 Verse 3"


def test_chunk_multi_book_boundaries() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=2)
    pericopes = [
        Pericope(book="GEN", chapter=50, verse=22, heading="Death of Joseph", verse_count=5),
        Pericope(book="EXO", chapter=1, verse=1, heading="Israel Multiplies", verse_count=7),
    ]
    chunks = chunker.chunk(pericopes)
    assert len(chunks) == 2
    assert chunks[0].book == "GEN"
    assert chunks[0].headings == ["Death of Joseph"]
    assert chunks[1].book == "EXO"
    assert chunks[1].headings == ["Israel Multiplies"]


def test_load_pericopes() -> None:
    pericopes = load_pericopes(BSB_PERICOPES_PATH)
    assert isinstance(pericopes, list)
    assert len(pericopes) > 3000
    assert pericopes[0].book == "GEN"
