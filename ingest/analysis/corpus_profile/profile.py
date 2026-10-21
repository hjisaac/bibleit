from typing import Any, Sequence

from datalens import AnalysisConfig, run_analysis

from bibleit_ingest.constants import OLD_TESTAMENT_BOOKS, USFM_ORDER
from bibleit_ingest.renderers import HeadingAndTextRenderer
from bibleit_ingest.types import BookCorpus, Passage, Pericope


def profile_corpus(
    corpus: BookCorpus,
    pericopes: Sequence[Pericope],
    tokenizer: Any,
    token_limit: int = 512,
) -> dict[str, Any]:
    # Pass 1: verse-level tokens, words, and subword expansion ratio
    verse_records = []
    for b in USFM_ORDER:
        for v in corpus.get_book(b):
            words = len(v.text.split())
            tokens = len(tokenizer.encode(v.text).ids)
            verse_records.append({
                "book": v.book,
                "testament": "OT" if v.book in OLD_TESTAMENT_BOOKS else "NT",
                "word_count": words,
                "token_count": tokens,
                "tokens_per_word": round(tokens / max(words, 1), 3),
            })

    # Pass 2: raw pericope-level verses, words, and tokens (with headings)
    renderer = HeadingAndTextRenderer(corpus=corpus)
    pericope_records = []
    for b in USFM_ORDER:
        b_verses = corpus.get_book(b)
        if not b_verses:
            continue
        b_pericopes = [p for p in pericopes if p.book == b]
        if not b_pericopes:
            continue
        for i, p in enumerate(b_pericopes):
            next_start = b_pericopes[i + 1].start if i + 1 < len(b_pericopes) else (999, 999)
            p_verses = [v for v in b_verses if p.start <= v.coordinate < next_start]
            if not p_verses:
                continue
            passage = Passage(
                book=b,
                start=p_verses[0].coordinate,
                end=p_verses[-1].coordinate,
                headings=((p.start[0], p.start[1], p.heading),) if p.heading else (),
            )
            text = renderer.render(passage)
            words = len(text.split())
            tokens = len(tokenizer.encode(text).ids)
            v_cnt = len(p_verses)
            pericope_records.append({
                "book": p.book,
                "testament": "OT" if p.book in OLD_TESTAMENT_BOOKS else "NT",
                "verse_count": v_cnt,
                "word_count": words,
                "token_count": tokens,
                "tokens_per_verse": round(tokens / max(v_cnt, 1), 2),
            })

    # Streaming stats via datalens
    v_cfg = AnalysisConfig(
        columns={
            "token_count": "quantile",
            "word_count": "numeric",
            "tokens_per_word": "numeric",
            "book": "categorical",
        },
        quantiles=[0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99],
    )
    verse_stats = run_analysis(v_cfg, source=verse_records).to_dict()

    p_cfg = AnalysisConfig(
        columns={
            "token_count": "quantile",
            "word_count": "numeric",
            "verse_count": "numeric",
            "tokens_per_verse": "numeric",
            "book": "categorical",
        },
        quantiles=[0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99],
    )
    pericope_stats = run_analysis(p_cfg, source=pericope_records).to_dict()

    # Rollup metrics for tracker summaries
    v_group = verse_stats.get("groups", {}).get("_all", {})
    p_group = pericope_stats.get("groups", {}).get("_all", {})
    v_tok = v_group.get("token_count", {})
    v_words = v_group.get("word_count", {})
    v_ratio = v_group.get("tokens_per_word", {})

    p_tok = p_group.get("token_count", {})
    p_verses = p_group.get("verse_count", {})
    p_words = p_group.get("word_count", {})

    n_p = len(pericope_records)
    under_100 = sum(1 for r in pericope_records if r["token_count"] < 100)
    under_150 = sum(1 for r in pericope_records if r["token_count"] < 150)
    over_400 = sum(1 for r in pericope_records if r["token_count"] > 400)
    over_limit = sum(1 for r in pericope_records if r["token_count"] > token_limit)

    metrics = {
        "total_verses": len(verse_records),
        "total_pericopes": n_p,
        "verse_mean_words": round(float(v_words.get("mean", 0)), 2),
        "verse_mean_tokens_per_word": round(float(v_ratio.get("mean", 0)), 3),
        "verse_p50_tokens": round(float(v_tok.get("p50", 0)), 1),
        "verse_p95_tokens": round(float(v_tok.get("p95", 0)), 1),
        "pericope_mean_verses": round(float(p_verses.get("mean", 0)), 2),
        "pericope_mean_words": round(float(p_words.get("mean", 0)), 2),
        "pericope_min_tokens": int(p_tok.get("min", 0)),
        "pericope_max_tokens": int(p_tok.get("max", 0)),
        "pericope_p25_tokens": round(float(p_tok.get("p25", 0)), 1),
        "pericope_p50_tokens": round(float(p_tok.get("p50", 0)), 1),
        "pericope_p75_tokens": round(float(p_tok.get("p75", 0)), 1),
        "pericope_p90_tokens": round(float(p_tok.get("p90", 0)), 1),
        "pericope_p95_tokens": round(float(p_tok.get("p95", 0)), 1),
        "pericope_p99_tokens": round(float(p_tok.get("p99", 0)), 1),
        "pericope_under_100_tokens_pct": round(under_100 / n_p * 100, 2) if n_p else 0.0,
        "pericope_under_150_tokens_pct": round(under_150 / n_p * 100, 2) if n_p else 0.0,
        "pericope_over_400_tokens_pct": round(over_400 / n_p * 100, 2) if n_p else 0.0,
        "pericope_over_limit_tokens_pct": round(over_limit / n_p * 100, 2) if n_p else 0.0,
    }

    return {
        "metrics": metrics,
        "verse_stats": verse_stats,
        "pericope_stats": pericope_stats,
        "verse_records": verse_records,
        "pericope_records": pericope_records,
    }
