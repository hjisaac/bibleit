from bibleit_ingest.constants import BSB_DIR, WEB_PATH
from bibleit_ingest.pericopes import PreparedCorpus, get_or_prepare_corpus


def test_get_or_prepare_corpus() -> None:
    corpus = get_or_prepare_corpus(WEB_PATH, BSB_DIR)
    assert isinstance(corpus, PreparedCorpus)

    # Verify NamedTuple attribute access
    assert isinstance(corpus.pericopes, list)
    assert len(corpus.pericopes) > 3000
    assert corpus.pericopes[0].book == "GEN"
    assert len(corpus.ordered_verses) > 30_000
    assert ("GEN", 1, 1) in corpus.address_index

    # Verify tuple unpacking support
    pericopes, verses, addr_idx = corpus
    assert pericopes is corpus.pericopes
    assert verses is corpus.ordered_verses
    assert addr_idx is corpus.address_index
