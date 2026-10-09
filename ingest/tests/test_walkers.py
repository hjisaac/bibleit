import json
from pathlib import Path

from bibleit_ingest.chunking import load_web_verses
from bibleit_ingest.walkers import BsbBookWalker, BsbCorpusWalker, WebCorpusWalker


def test_web_corpus_walker(tmp_path: Path) -> None:
    web_file = tmp_path / "web.json"
    data = {
        "books": [
            {
                "nr": 1,
                "chapters": [
                    {
                        "chapter": "1",
                        "verses": [
                            {"verse": "1", "text": "In the beginning"},
                            {"verse": "2", "text": "The earth was formless"},
                        ],
                    }
                ],
            }
        ]
    }
    web_file.write_text(json.dumps(data))

    walker = WebCorpusWalker(web_file)
    results = list(walker.walk())
    assert len(results) == 2
    assert results[0] == (("GEN", 1, 1), "In the beginning")
    assert results[1] == (("GEN", 1, 2), "The earth was formless")

    # load_web_verses delegates to walker
    assert load_web_verses(web_file) == results


def test_bsb_book_and_corpus_walker(tmp_path: Path) -> None:
    gen_file = tmp_path / "GEN.usj"
    usj_data = {
        "type": "USJ",
        "content": [
            {"type": "chapter", "number": "1"},
            {"type": "para", "marker": "s1", "content": ["The Creation"]},
            {"type": "verse", "number": "1"},
            {"type": "verse", "number": "2"},
            {"type": "para", "marker": "s1", "content": ["Light"]},
            {"type": "verse", "number": "3"},
        ],
    }
    gen_file.write_text(json.dumps(usj_data))

    walker = BsbBookWalker(gen_file)
    events = list(walker.walk())
    assert len(events) == 3
    assert events[0].address == ("GEN", 1, 1)
    assert events[0].heading == "The Creation"
    assert events[1].address == ("GEN", 1, 2)
    assert events[1].heading is None
    assert events[2].address == ("GEN", 1, 3)
    assert events[2].heading == "Light"

    corpus_walker = BsbCorpusWalker(tmp_path)
    corpus_events = list(corpus_walker.walk())
    assert len(corpus_events) == 3
    assert corpus_events == events


def test_bsb_pericope_walker(tmp_path: Path) -> None:
    gen_file = tmp_path / "GEN.usj"
    usj_data = {
        "type": "USJ",
        "content": [
            {"type": "chapter", "number": "1"},
            {"type": "para", "marker": "s1", "content": ["The Creation"]},
            {"type": "verse", "number": "1"},
            {"type": "verse", "number": "2"},
            {"type": "para", "marker": "s1", "content": ["Light"]},
            {"type": "verse", "number": "3"},
        ],
    }
    gen_file.write_text(json.dumps(usj_data))

    from bibleit_ingest.pericopes import derive_bsb_pericopes
    from bibleit_ingest.walkers import BsbPericopeWalker

    walker = BsbPericopeWalker(tmp_path)
    pericopes = list(walker.walk())
    assert len(pericopes) == 2
    assert pericopes[0].book == "GEN"
    assert pericopes[0].heading == "The Creation"
    assert pericopes[0].verse_count == 2
    assert pericopes[1].book == "GEN"
    assert pericopes[1].heading == "Light"
    assert pericopes[1].verse_count == 1

    # derive_bsb_pericopes delegates to BsbPericopeWalker
    assert derive_bsb_pericopes(tmp_path) == pericopes
