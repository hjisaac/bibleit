from bibleit_ingest.constants import BSB_DIR, WEB_PATH
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.types import BookCorpus


def test_get_or_prepare_corpus() -> None:
    corpus, pericopes = get_or_prepare_corpus(WEB_PATH, BSB_DIR)
    assert isinstance(corpus, BookCorpus)
    assert isinstance(pericopes, list)
    assert len(pericopes) > 3000
    assert pericopes[0].book == "GEN"
    assert pericopes[0].start == (1, 1)
    assert pericopes[0].chapter == 1
    assert pericopes[0].verse == 1
    assert ("GEN", 1, 1) in corpus
    assert corpus.get_verse("GEN", 1, 1) is not None
