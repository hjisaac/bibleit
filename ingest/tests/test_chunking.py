import json
from pathlib import Path
import pytest

from bibleit_ingest.chunking import (
    AdaptiveWindowChunker,
    AddressAndHeadingRenderer,
    BookAndHeadingRenderer,
    Chunk,
    HeadingAndTextRenderer,
    Passage,
    Pericope,
    TextOnlyRenderer,
    VerseAddress,
    get_renderer,
    index_verses_by_address,
    load_pericopes,
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
        Pericope(book="GEN", start=(1, 1), heading="Heading 1", verse_count=2),
        Pericope(book="GEN", start=(1, 3), heading="Heading 2", verse_count=4),
        Pericope(book="GEN", start=(1, 7), heading="Heading 3", verse_count=8),
    ]
    chunks = chunker.chunk(pericopes)

    # First two pericopes (2 + 4 = 6 >= floor 5) merge together
    # Third pericope (8 >= floor 5) stands alone
    assert len(chunks) == 2
    assert chunks[0].verse_count == 6
    assert list(chunks[0].headings) == ["Heading 1", "Heading 2"]
    assert chunks[0].book == "GEN"

    assert chunks[1].verse_count == 8
    assert list(chunks[1].headings) == ["Heading 3"]


def test_chunker_backward_merge_last_pericope() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=0)
    pericopes = [
        Pericope(book="EXO", start=(1, 1), heading="P1", verse_count=8),
        Pericope(book="EXO", start=(1, 9), heading="P2", verse_count=2),  # undersized at end
    ]
    chunks = chunker.chunk(pericopes)

    # 8 + 2 = 10 <= ceiling 15, merges backward into previous chunk
    assert len(chunks) == 1
    assert chunks[0].verse_count == 10
    assert list(chunks[0].headings) == ["P1", "P2"]


def test_chunker_backward_merge_exceeding_ceiling() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=10, overlap=0)
    pericopes = [
        Pericope(book="EXO", start=(1, 1), heading="P1", verse_count=9),
        Pericope(book="EXO", start=(1, 10), heading="P2", verse_count=2),  # 9 + 2 = 11 > 10
    ]
    chunks = chunker.chunk(pericopes)

    # Cannot merge backward without exceeding ceiling 10, so stands alone
    assert len(chunks) == 2
    assert chunks[0].verse_count == 9
    assert chunks[1].verse_count == 2


def test_chunker_overlap() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=20, overlap=3)
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="P1", verse_count=6),
        Pericope(book="GEN", start=(1, 7), heading="P2", verse_count=7),
        Pericope(book="GEN", start=(1, 14), heading="P3", verse_count=8),
    ]
    chunks = chunker.chunk(pericopes)

    assert len(chunks) == 3
    assert list(chunks[0].headings) == ["P1"]
    assert chunks[0].verse_count == 6

    # Chunk 1 starts with 3 overlap verses from P1 (verse index 6 - 3 = 3)
    assert list(chunks[1].headings) == ["P1", "P2"]
    assert chunks[1].verse_count == 10  # 3 overlap + 7 fresh
    assert chunks[1].start_idx == 3
    assert chunks[1].end_idx == 13

    # Chunk 2 starts with 3 overlap verses from P2 (verse index 13 - 3 = 10)
    assert list(chunks[2].headings) == ["P2", "P3"]
    assert chunks[2].verse_count == 11  # 3 overlap + 8 fresh
    assert chunks[2].start_idx == 10
    assert chunks[2].end_idx == 21


def test_chunker_overlap_skips_when_exceeding_ceiling() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=4)
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="P1", verse_count=12),
        Pericope(book="GEN", start=(1, 13), heading="P2", verse_count=12),
    ]
    chunks = chunker.chunk(pericopes)

    # 4 overlap + 12 fresh = 16 > 15 ceiling: overlap prefix skipped
    assert len(chunks) == 2
    assert list(chunks[0].headings) == ["P1"]
    assert list(chunks[1].headings) == ["P2"]


def test_index_and_render_chunk() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "In the beginning,"),
        (("GEN", 1, 2), "the earth was formless."),
        (("GEN", 1, 3), "God said, Let there be light."),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    assert addr_index[("GEN", 1, 1)] == 0
    assert addr_index[("GEN", 1, 3)] == 2

    p = Passage(book="GEN", start_idx=0, end_idx=2, headings=("Creation",))
    renderer = HeadingAndTextRenderer(ordered_verses, addr_index)
    assert renderer.render(p) == "Creation\nIn the beginning, the earth was formless."


def test_chunk_renderer_sections() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "Verse 1"),
        (("GEN", 1, 2), "Verse 2"),
        (("GEN", 1, 3), "Verse 3"),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    p = Passage(
        book="GEN",
        start_idx=0,
        end_idx=3,
        sections=((0, "Heading 1"), (1, "Heading 2")),
    )

    renderer = HeadingAndTextRenderer(ordered_verses, addr_index)
    assert renderer.render(p) == "Heading 1\nVerse 1\n\nHeading 2\nVerse 2 Verse 3"

    p_lead = Passage(
        book="GEN",
        start_idx=0,
        end_idx=3,
        sections=((0, None), (1, "Heading 2")),
    )
    assert renderer.render(p_lead) == "Verse 1\n\nHeading 2\nVerse 2 Verse 3"


def test_chunk_renderer_strategies() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "Verse 1"),
        (("GEN", 1, 2), "Verse 2"),
        (("GEN", 1, 3), "Verse 3"),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    p = Passage(
        book="GEN",
        start_idx=0,
        end_idx=3,
        headings=("The Creation",),
        sections=((0, "The Creation"), (1, "Light")),
    )

    r_text = get_renderer("text_only", ordered_verses, addr_index)
    assert r_text.render(p) == "Verse 1\n\nVerse 2 Verse 3"

    r_book = get_renderer("book_and_heading", ordered_verses, addr_index)
    assert r_book.render(p) == "Genesis — The Creation\nVerse 1\n\nGenesis — Light\nVerse 2 Verse 3"

    r_addr = get_renderer("address_and_heading", ordered_verses, addr_index)
    assert r_addr.render(p) == "[Genesis 1:1] The Creation\nVerse 1\n\n[Genesis 1:2–3] Light\nVerse 2 Verse 3"


def test_chunk_multi_book_boundaries() -> None:
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=2)
    pericopes = [
        Pericope(book="GEN", start=(50, 22), heading="Death of Joseph", verse_count=5),
        Pericope(book="EXO", start=(1, 1), heading="Israel Multiplies", verse_count=7),
    ]
    chunks = chunker.chunk(pericopes)
    assert len(chunks) == 2
    assert chunks[0].book == "GEN"
    assert list(chunks[0].headings) == ["Death of Joseph"]
    assert chunks[1].book == "EXO"
    assert list(chunks[1].headings) == ["Israel Multiplies"]


def test_load_pericopes(tmp_path: Path) -> None:
    sample_file = tmp_path / "sample_pericopes.json"
    sample_file.write_text(
        json.dumps({
            "pericopes": [
                {
                    "book": "GEN",
                    "chapter": 1,
                    "verse": 1,
                    "heading": "The Creation",
                    "verse_count": 31,
                }
            ]
        })
    )
    pericopes = load_pericopes(sample_file)
    assert isinstance(pericopes, list)
    assert len(pericopes) == 1
    assert pericopes[0].book == "GEN"
    assert pericopes[0].heading == "The Creation"
    assert pericopes[0].verse_count == 31

    if BSB_PERICOPES_PATH.exists():
        real_pericopes = load_pericopes(BSB_PERICOPES_PATH)
        assert len(real_pericopes) > 3000


def test_dedicated_renderer_subclasses() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "Verse 1"),
        (("GEN", 1, 2), "Verse 2"),
    ]
    addr_index = index_verses_by_address(ordered_verses)
    p = Passage(
        book="GEN",
        start_idx=0,
        end_idx=2,
        sections=((0, "Heading"),),
    )

    t_renderer = TextOnlyRenderer(ordered_verses, addr_index)
    assert t_renderer.render(p) == "Verse 1 Verse 2"

    h_renderer = HeadingAndTextRenderer(ordered_verses, addr_index)
    assert h_renderer.render(p) == "Heading\nVerse 1 Verse 2"

    b_renderer = BookAndHeadingRenderer(ordered_verses, addr_index)
    assert b_renderer.render(p) == "Genesis — Heading\nVerse 1 Verse 2"

    a_renderer = AddressAndHeadingRenderer(ordered_verses, addr_index)
    assert a_renderer.render(p) == "[Genesis 1:1–2] Heading\nVerse 1 Verse 2"

    # Test factory creates the configured strategy type
    factory_r = get_renderer("book_and_heading", ordered_verses, addr_index)
    assert isinstance(factory_r, BookAndHeadingRenderer)

    with pytest.raises(ValueError, match="Unknown render strategy"):
        get_renderer("nonexistent", ordered_verses, addr_index)


def test_pericope_chunker() -> None:
    from bibleit_ingest.chunking import PericopeChunker

    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="Day 1", verse_count=5),
        Pericope(book="GEN", start=(1, 6), heading="Day 2", verse_count=3),
        Pericope(book="EXO", start=(1, 1), heading="Egypt", verse_count=10),
    ]
    # No overlap: strictly 1 chunk per pericope
    chunker = PericopeChunker(ceiling=30, overlap=0)
    chunks = chunker.chunk(pericopes)
    assert len(chunks) == 3
    assert chunks[0].verse_count == 5
    assert list(chunks[0].headings) == ["Day 1"]
    assert chunks[1].verse_count == 3
    assert list(chunks[1].headings) == ["Day 2"]
    assert chunks[2].verse_count == 10
    assert list(chunks[2].headings) == ["Egypt"]

    # With overlap + include_overlap_heading=True: chunk 2 includes Day 1 heading for lead-in
    chunker_overlap = PericopeChunker(ceiling=30, overlap=2, include_overlap_heading=True)
    chunks_ov = chunker_overlap.chunk(pericopes)
    assert len(chunks_ov) == 3
    assert chunks_ov[0].verse_count == 5
    assert chunks_ov[1].verse_count == 5  # 3 fresh + 2 lead-in
    assert list(chunks_ov[1].headings) == ["Day 1", "Day 2"]
    assert chunks_ov[2].verse_count == 10  # new book EXO, no overlap from GEN

    # With overlap + include_overlap_heading=False: chunk 2 only has Day 2 heading
    chunker_no_ovh = PericopeChunker(ceiling=30, overlap=2, include_overlap_heading=False)
    chunks_no_ovh = chunker_no_ovh.chunk(pericopes)
    assert len(chunks_no_ovh) == 3
    assert chunks_no_ovh[1].verse_count == 5
    assert list(chunks_no_ovh[1].headings) == ["Day 2"]
    assert chunks_no_ovh[1].sections[0][1] is None  # lead-in section heading is None


def test_token_window_chunker() -> None:
    from bibleit_ingest.chunking import TokenWindowChunker

    # 10 verses of 10 words each (~13 tokens each)
    ordered_verses = [
        (("GEN", 1, i), "word " * 10)
        for i in range(1, 7)
    ] + [
        (("EXO", 1, i), "word " * 10)
        for i in range(1, 5)
    ]
    addr_index = {addr: i for i, (addr, _) in enumerate(ordered_verses)}

    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="Gen Part 1", verse_count=3),
        Pericope(book="GEN", start=(1, 4), heading="Gen Part 2", verse_count=3),
        Pericope(book="EXO", start=(1, 1), heading="Exo Story", verse_count=4),
    ]

    # Mock tokenizer returning 10 tokens per verse
    class MockTokenizer:
        def encode(self, text: str) -> list[int]:
            return [1] * 10

    # ceiling=50, headroom_margin=10 -> effective ceiling = 40 tokens (4 verses max per chunk)
    chunker = TokenWindowChunker(
        ceiling=50,
        overlap=1,
        ordered_verses=ordered_verses,
        address_index=addr_index,
        tokenizer=MockTokenizer(),
        headroom_margin=10,
    )
    chunks = chunker.chunk(pericopes)

    # Verifies chunks never cross book boundaries
    for c in chunks:
        start_book = ordered_verses[c.start_idx][0][0]
        end_book = ordered_verses[c.end_idx - 1][0][0]
        assert start_book == end_book == c.book

    # Genesis has 6 verses, Exo has 4 verses.
    # No single chunk can have more than 4 verses (effective ceiling 40 // 10 tokens = 4)
    for c in chunks:
        assert c.verse_count <= 4

    # Check validation errors
    with pytest.raises(ValueError, match="ceiling must be positive"):
        TokenWindowChunker(ceiling=0)
    with pytest.raises(ValueError, match="headroom_margin cannot meet or exceed ceiling"):
        TokenWindowChunker(ceiling=50, headroom_margin=50)


def test_passage_headings_meta_no_raw_book_codes() -> None:
    ordered_verses = [
        (("PHP", 4, 4), "Rejoice in the Lord always"),
        (("PHP", 4, 7), "And the peace of God"),
    ]
    # Passage with a real heading and a raw book code in sections
    passage = Passage(
        book="PHP",
        start=(4, 4),
        end=(4, 7),
        start_idx=0,
        end_idx=2,
        sections=((0, "Rejoice in the Lord"), (1, "PHP")),
    )
    meta = passage.get_headings_meta(ordered_verses)
    assert meta == [[4, 4, "Rejoice in the Lord"]]
    # Verify raw book code "PHP" was filtered out
    assert not any("PHP" in item for item in meta)


def test_adaptive_chunker_headings_clean() -> None:
    ordered_verses = [(("GEN", 1, i), f"Verse {i}") for i in range(1, 11)]
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="The Creation", verse_count=5),
        Pericope(book="GEN", start=(1, 6), heading="", verse_count=5),
    ]
    chunker = AdaptiveWindowChunker(floor=8, ceiling=15, ordered_verses=ordered_verses)
    chunks = chunker.chunk(pericopes)
    assert len(chunks) == 1
    # Check that sections do not contain "GEN"
    for _, heading in chunks[0].sections:
        assert heading != "GEN"
    meta = chunks[0].get_headings_meta(ordered_verses)
    assert meta == [[1, 1, "The Creation"]]


def test_coordinate_dataclasses_verse_pericope_passage() -> None:
    from bibleit_ingest.types import Verse

    # Verse with start coordinate
    v = Verse(book="GEN", start=(1, 1), text="In the beginning")
    assert v.book == "GEN"
    assert v.start == (1, 1)
    assert v.chapter == 1
    assert v.verse == 1
    assert v.address == ("GEN", 1, 1)

    # Verse backward compatibility
    v_legacy = Verse(book="JHN", chapter=3, verse=16, text="For God so loved the world")
    assert v_legacy.start == (3, 16)
    assert v_legacy.chapter == 3
    assert v_legacy.verse == 16
    assert v_legacy.address == ("JHN", 3, 16)

    # Pericope with start coordinate
    p = Pericope(book="GEN", start=(1, 1), heading="Creation", verse_count=31)
    assert p.start == (1, 1)
    assert p.chapter == 1
    assert p.verse == 1
    assert p.address == ("GEN", 1, 1)

    # Passage with start and end coordinates
    passage = Passage(book="GEN", start=(1, 1), end=(1, 31), start_idx=0, end_idx=31)
    assert passage.start == (1, 1)
    assert passage.end == (1, 31)
    assert passage.chapter == 1
    assert passage.verse == 1
    assert passage.start_address == ("GEN", 1, 1)
    assert passage.end_address == ("GEN", 1, 31)
    assert passage.verse_count == 31



