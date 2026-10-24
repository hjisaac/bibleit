import pytest

from bibleit_ingest.chunking import (
    AdaptiveWindowChunker,
    PericopeChunker,
    TokenWindowChunker,
    build_verse_to_chunk_index,
    get_chunker,
)
from bibleit_ingest.renderers import (
    AddressAndHeadingRenderer,
    BookAndHeadingRenderer,
    HeadingAndTextRenderer,
    TextOnlyRenderer,
    get_renderer,
)
from bibleit_ingest.types import BookCorpus, ChunkConfig, Passage, Pericope, Verse


def _create_mock_corpus(verses_by_book: dict[str, list[tuple[int, int, str]]]) -> BookCorpus:
    """Helper to construct BookCorpus from [(ch, v, text), ...]."""
    data: dict[str, dict[int, dict[int, str]]] = {}
    for book, vlist in verses_by_book.items():
        b_dict: dict[int, dict[int, str]] = {}
        for ch, v, txt in vlist:
            b_dict.setdefault(ch, {})[v] = txt
        data[book] = b_dict
    return BookCorpus(data)


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
    # 14 verses total in Genesis
    verses = [("GEN", [(1, i, f"Gen 1:{i}") for i in range(1, 15)])]
    corpus = _create_mock_corpus(dict(verses))
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=0, corpus=corpus)
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="Heading 1"),
        Pericope(book="GEN", start=(1, 3), heading="Heading 2"),
        Pericope(book="GEN", start=(1, 7), heading="Heading 3"),
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    # First two pericopes (v1-2: 2 verses + v3-6: 4 verses = 6 verses >= floor 5)
    # Third pericope (v7-14: 8 verses >= floor 5)
    assert len(chunks) == 2
    assert chunks[0].start == (1, 1)
    assert chunks[0].end == (1, 6)
    assert chunks[0].headings == ((1, 1, "Heading 1"), (1, 3, "Heading 2"))

    assert chunks[1].start == (1, 7)
    assert chunks[1].end == (1, 14)
    assert chunks[1].headings == ((1, 7, "Heading 3"),)


def test_chunker_backward_merge_last_pericope() -> None:
    verses = [("EXO", [(1, i, f"Exo 1:{i}") for i in range(1, 11)])]
    corpus = _create_mock_corpus(dict(verses))
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=0, corpus=corpus)
    pericopes = [
        Pericope(book="EXO", start=(1, 1), heading="P1"),  # 8 verses: 1..8
        Pericope(book="EXO", start=(1, 9), heading="P2"),  # 2 verses: 9..10 (undersized at end)
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    # 8 + 2 = 10 <= ceiling 15, merges backward into previous chunk
    assert len(chunks) == 1
    assert chunks[0].start == (1, 1)
    assert chunks[0].end == (1, 10)
    assert chunks[0].headings == ((1, 1, "P1"), (1, 9, "P2"))


def test_chunker_backward_merge_exceeding_ceiling() -> None:
    verses = [("EXO", [(1, i, f"Exo 1:{i}") for i in range(1, 12)])]
    corpus = _create_mock_corpus(dict(verses))
    chunker = AdaptiveWindowChunker(floor=5, ceiling=10, overlap=0, corpus=corpus)
    pericopes = [
        Pericope(book="EXO", start=(1, 1), heading="P1"),  # 9 verses: 1..9
        Pericope(book="EXO", start=(1, 10), heading="P2"),  # 2 verses: 10..11
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    # Cannot merge backward without exceeding ceiling 10 (9 + 2 = 11 > 10)
    assert len(chunks) == 2
    assert chunks[0].start == (1, 1)
    assert chunks[0].end == (1, 9)
    assert chunks[1].start == (1, 10)
    assert chunks[1].end == (1, 11)


def test_chunker_oversize_pericope_subdivision() -> None:
    # 50 verses in Psalm 119
    verses = [("PSA", [(119, i, f"Psalm 119:{i}") for i in range(1, 51)])]
    corpus = _create_mock_corpus(dict(verses))
    # Ceiling 20: 50 verses should subdivide into 1..20, 21..40, 41..50
    chunker = AdaptiveWindowChunker(floor=5, ceiling=20, overlap=0, corpus=corpus)
    pericopes = [
        Pericope(book="PSA", start=(119, 1), heading="The Law of the Lord"),
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    assert len(chunks) == 3
    assert chunks[0].start == (119, 1)
    assert chunks[0].end == (119, 20)
    assert chunks[0].headings == ((119, 1, "The Law of the Lord"),)

    assert chunks[1].start == (119, 21)
    assert chunks[1].end == (119, 40)
    assert chunks[1].headings == ((119, 1, "The Law of the Lord"),)

    assert chunks[2].start == (119, 41)
    assert chunks[2].end == (119, 50)
    assert chunks[2].headings == ((119, 1, "The Law of the Lord"),)


def test_chunker_overlap() -> None:
    verses = [("GEN", [(1, i, f"Gen 1:{i}") for i in range(1, 22)])]
    corpus = _create_mock_corpus(dict(verses))
    chunker = AdaptiveWindowChunker(floor=5, ceiling=20, overlap=3, corpus=corpus)
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="P1"),   # 1..6 (6 verses)
        Pericope(book="GEN", start=(1, 7), heading="P2"),   # 7..13 (7 verses)
        Pericope(book="GEN", start=(1, 14), heading="P3"),  # 14..21 (8 verses)
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    assert len(chunks) == 3
    # Chunk 0: 1..6
    assert chunks[0].start == (1, 1)
    assert chunks[0].end == (1, 6)
    assert chunks[0].headings == ((1, 1, "P1"),)

    # Chunk 1: starts with 3 overlap verses from P1 (verses 4..6 + 7..13 = 4..13)
    assert chunks[1].start == (1, 4)
    assert chunks[1].end == (1, 13)
    assert chunks[1].headings == ((1, 1, "P1"), (1, 7, "P2"))

    # Chunk 2: starts with 3 overlap verses from P2 (verses 11..13 + 14..21 = 11..21)
    assert chunks[2].start == (1, 11)
    assert chunks[2].end == (1, 21)
    assert chunks[2].headings == ((1, 7, "P2"), (1, 14, "P3"))


def test_chunk_multi_book_boundaries() -> None:
    verses = {
        "GEN": [(50, i, f"Gen 50:{i}") for i in range(22, 27)],
        "EXO": [(1, i, f"Exo 1:{i}") for i in range(1, 8)],
    }
    corpus = _create_mock_corpus(verses)
    chunker = AdaptiveWindowChunker(floor=5, ceiling=15, overlap=2, corpus=corpus)
    pericopes = [
        Pericope(book="GEN", start=(50, 22), heading="Death of Joseph"),
        Pericope(book="EXO", start=(1, 1), heading="Israel Multiplies"),
    ]
    chunks = chunker.chunk(pericopes, corpus=corpus)

    assert len(chunks) == 2
    assert chunks[0].book == "GEN"
    assert chunks[0].headings == ((50, 22, "Death of Joseph"),)
    assert chunks[1].book == "EXO"
    assert chunks[1].headings == ((1, 1, "Israel Multiplies"),)


def test_pericope_chunker() -> None:
    verses = {
        "GEN": [(1, i, f"Gen 1:{i}") for i in range(1, 9)],
        "EXO": [(1, i, f"Exo 1:{i}") for i in range(1, 11)],
    }
    corpus = _create_mock_corpus(verses)
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="Day 1"),  # 1..5
        Pericope(book="GEN", start=(1, 6), heading="Day 2"),  # 6..8
        Pericope(book="EXO", start=(1, 1), heading="Egypt"),  # 1..10
    ]
    chunker = PericopeChunker(ceiling=30, overlap=0, corpus=corpus)
    chunks = chunker.chunk(pericopes, corpus=corpus)
    assert len(chunks) == 3
    assert chunks[0].start == (1, 1)
    assert chunks[0].end == (1, 5)
    assert chunks[1].start == (1, 6)
    assert chunks[1].end == (1, 8)
    assert chunks[2].start == (1, 1)
    assert chunks[2].end == (1, 10)


def test_renderers() -> None:
    corpus = _create_mock_corpus({
        "GEN": [
            (1, 1, "In the beginning,"),
            (1, 2, "the earth was formless."),
        ]
    })
    passage = Passage(
        book="GEN",
        start=(1, 1),
        end=(1, 2),
        headings=((1, 1, "The Creation"),),
    )

    t_renderer = TextOnlyRenderer(corpus=corpus)
    assert t_renderer.render(passage) == "In the beginning, the earth was formless."

    h_renderer = HeadingAndTextRenderer(corpus=corpus)
    assert h_renderer.render(passage) == "The Creation\nIn the beginning, the earth was formless."

    b_renderer = BookAndHeadingRenderer(corpus=corpus)
    assert b_renderer.render(passage) == "Genesis — The Creation\nIn the beginning, the earth was formless."

    a_renderer = AddressAndHeadingRenderer(corpus=corpus)
    assert a_renderer.render(passage) == "[Genesis 1:1–2] The Creation\nIn the beginning, the earth was formless."

    factory_r = get_renderer("book_and_heading", corpus=corpus)
    assert isinstance(factory_r, BookAndHeadingRenderer)

    with pytest.raises(ValueError, match="Unknown render strategy"):
        get_renderer("nonexistent", corpus=corpus)


def test_build_verse_to_chunk_index() -> None:
    corpus = _create_mock_corpus({
        "GEN": [(1, i, f"Verse {i}") for i in range(1, 6)]
    })
    chunks = [
        Passage(book="GEN", start=(1, 1), end=(1, 3)),
        Passage(book="GEN", start=(1, 3), end=(1, 5)),
    ]
    index = build_verse_to_chunk_index(corpus, chunks)

    assert index[("GEN", 1, 1)] == [0]
    assert index[("GEN", 1, 2)] == [0]
    assert index[("GEN", 1, 3)] == [0, 1]  # overlapping verse!
    assert index[("GEN", 1, 4)] == [1]
    assert index[("GEN", 1, 5)] == [1]


def test_coordinate_dataclasses() -> None:
    v = Verse(book="GEN", chapter=1, verse=1, text="In the beginning")
    assert v.coordinate == (1, 1)
    assert v.address == ("GEN", 1, 1)

    p = Pericope(book="GEN", start=(1, 1), heading="Creation")
    assert p.start == (1, 1)
    assert p.chapter == 1
    assert p.verse == 1

    passage = Passage(book="GEN", start=(1, 1), end=(1, 31), headings=((1, 1, "Creation"),))
    assert passage.chapter == 1
    assert passage.verse == 1
    assert ("GEN", 1, 1) in passage
    assert ("GEN", 1, 15) in passage
    assert ("GEN", 1, 31) in passage
    assert ("GEN", 1, 32) not in passage
    assert ("EXO", 1, 1) not in passage


def test_option_a_multi_section_rendering() -> None:
    corpus = _create_mock_corpus({
        "GEN": [(1, i, f"Verse {i}") for i in range(1, 6)]
    })
    # Passage with 2 constituent headings: P1 for v1-3, P2 for v4-5
    p_multi = Passage(
        book="GEN",
        start=(1, 1),
        end=(1, 5),
        headings=((1, 1, "P1"), (1, 4, "P2")),
    )

    h_rend = HeadingAndTextRenderer(corpus=corpus)
    assert h_rend.render(p_multi) == "P1\nVerse 1 Verse 2 Verse 3\n\nP2\nVerse 4 Verse 5"

    b_rend = BookAndHeadingRenderer(corpus=corpus)
    assert b_rend.render(p_multi) == "Genesis — P1\nVerse 1 Verse 2 Verse 3\n\nGenesis — P2\nVerse 4 Verse 5"

    a_rend = AddressAndHeadingRenderer(corpus=corpus)
    assert a_rend.render(p_multi) == "[Genesis 1:1–3] P1\nVerse 1 Verse 2 Verse 3\n\n[Genesis 1:4–5] P2\nVerse 4 Verse 5"

    # Passage with unheaded overlap lead-in: verses 1-2 unheaded, P2 starting at v3
    p_unheaded_lead = Passage(
        book="GEN",
        start=(1, 1),
        end=(1, 4),
        headings=((1, 3, "P2"),),
    )
    assert h_rend.render(p_unheaded_lead) == "Verse 1 Verse 2\n\nP2\nVerse 3 Verse 4"
    assert b_rend.render(p_unheaded_lead) == "Genesis\nVerse 1 Verse 2\n\nGenesis — P2\nVerse 3 Verse 4"
    assert a_rend.render(p_unheaded_lead) == "[Genesis 1:1–2]\nVerse 1 Verse 2\n\n[Genesis 1:3–4] P2\nVerse 3 Verse 4"


def test_token_window_chunker() -> None:
    # 10 verses of ~3 words each (fallback ~3.9 -> 3 tokens each)
    corpus = _create_mock_corpus({
        "GEN": [(1, i, f"WordA WordB WordC") for i in range(1, 11)]
    })
    pericopes = [
        Pericope(book="GEN", start=(1, 1), heading="Beginning"),
        Pericope(book="GEN", start=(1, 6), heading="Middle"),
    ]
    # Ceiling 25, headroom 5 -> effective ceiling 20 tokens (~6-7 verses)
    chunker = TokenWindowChunker(ceiling=25, overlap=1, headroom_margin=5, corpus=corpus)
    chunks = chunker.chunk(pericopes, corpus=corpus)

    assert len(chunks) >= 2
    # Ensure first chunk cleanly splits at pericope or ceiling
    assert chunks[0].start == (1, 1)
    assert chunks[0].headings[0][2] == "Beginning"

    # Test factory instantiation for all strategies
    tok_chunker = get_chunker(ChunkConfig(strategy="token_window", ceiling=512, overlap=1), corpus=corpus)
    assert isinstance(tok_chunker, TokenWindowChunker)
    assert tok_chunker.ceiling == 512
    assert tok_chunker.overlap == 1

    adapt_chunker = get_chunker(ChunkConfig(strategy="adaptive", floor=4, ceiling=25, overlap=2), corpus=corpus)
    assert isinstance(adapt_chunker, AdaptiveWindowChunker)
    assert adapt_chunker.floor == 4
    assert adapt_chunker.ceiling == 25
    assert adapt_chunker.overlap == 2

    peri_chunker = get_chunker(ChunkConfig(strategy="pericope", ceiling=35, overlap=0), corpus=corpus)
    assert isinstance(peri_chunker, PericopeChunker)
    assert peri_chunker.ceiling == 35

    with pytest.raises(ValueError, match="Unknown chunking strategy"):
        get_chunker(ChunkConfig(strategy="unknown_strategy"), corpus=corpus)  # type: ignore[arg-type]

