from pathlib import Path

import pytest

from bibleit_ingest.chunking import Passage
from eval.helpers.report import (
    BaseRetrievalReport,
    DetailsBlock,
    RetrievalOutcome,
    format_passage,
    format_rank_label,
    generate_retrieval_report,
)


def test_details_block_rendering() -> None:
    closed = DetailsBlock("Closed Block", "Inside closed", is_open=False)
    assert str(closed) == "<details>\n<summary><b>Closed Block</b></summary>\n\n> Inside closed\n</details>"
    assert repr(closed) == "DetailsBlock(summary='Closed Block', is_open=False)"

    opened = DetailsBlock("Open Block", "Inside open", is_open=True)
    assert str(opened) == "<details open>\n<summary><b>Open Block</b></summary>\n\n> Inside open\n</details>"


def test_format_rank_label_adaptive_emojis() -> None:
    assert format_rank_label(1) == "1️⃣ Rank 1"
    assert format_rank_label(10) == "🔟 Rank 10"
    assert format_rank_label(11) == "Rank 11"
    assert format_rank_label(42) == "Rank 42"


def test_classify_outcome_default_and_custom_cutoff() -> None:
    report = BaseRetrievalReport(diagnostics=[], metrics={})
    assert report.classify_outcome(None) == RetrievalOutcome.MISS
    assert report.classify_outcome(1) == RetrievalOutcome.HIT
    assert report.classify_outcome(2) == RetrievalOutcome.NEAR_MISS

    relaxed_report = BaseRetrievalReport(diagnostics=[], metrics={}, hit_cutoff=3)
    assert relaxed_report.classify_outcome(None) == RetrievalOutcome.MISS
    assert relaxed_report.classify_outcome(1) == RetrievalOutcome.HIT
    assert relaxed_report.classify_outcome(3) == RetrievalOutcome.HIT
    assert relaxed_report.classify_outcome(4) == RetrievalOutcome.NEAR_MISS


def test_base_retrieval_report_full_generation(tmp_path: Path) -> None:
    diagnostics = [
        # Query 1: Direct Hit
        {
            "id": "q1",
            "query": "peace of God",
            "target_chunk_idx": 10,
            "target_rank": 1,
            "matches": [{"rank": 1, "chunk_idx": 10, "score": 0.89}],
        },
        # Query 2: Near Miss (target at rank 3)
        {
            "id": "q2",
            "query": "in the beginning",
            "target_chunk_idx": 20,
            "target_rank": 3,
            "matches": [
                {"rank": 1, "chunk_idx": 99, "score": 0.85},
                {"rank": 2, "chunk_idx": 98, "score": 0.80},
                {"rank": 3, "chunk_idx": 20, "score": 0.78},
            ],
        },
        # Query 3: Complete Miss (target not retrieved)
        {
            "id": "q3",
            "query": "resurrection and life",
            "target_chunk_idx": 30,
            "target_rank": None,
            "matches": [
                {"rank": 1, "chunk_idx": 50, "score": 0.65},
            ],
        },
    ]

    chunks = {
        10: ("PHP 4:6–7", "Peace that surpasses understanding"),
        20: ("GEN 1:1", "In the beginning God created"),
        30: ("JHN 11:25", "I am the resurrection"),
        50: ("1CO 15:1", "Now I would remind you"),
        98: ("PSA 102:25", "Of old You laid the foundations"),
        99: ("JHN 1:1", "In the beginning was the Word"),
    }

    out_file = tmp_path / "report.md"
    generate_retrieval_report(
        diagnostics=diagnostics,
        renderer=lambda idx: chunks[idx],
        metrics={"mrr": 0.5555, "recall@10": 0.6666},
        out_path=out_file,
    )

    assert out_file.exists()
    content = out_file.read_text()

    # Summary section checks
    assert "# Retrieval Inspection Report" in content
    assert "0.5555" in content
    assert "Total Evaluated" in content
    assert "Direct Hits" in content
    assert "Near Misses" in content
    assert "Misses" in content

    # Misses checks
    assert "Misses (Not in Top K)" in content
    assert "Query `q3`: *\"resurrection and life\"*" in content
    assert "🎯 Target: JHN 11:25" in content

    # Near Misses checks
    assert "Near Misses" in content
    assert "Query `q2`: *\"in the beginning\"*" in content
    assert "🎯 Target [Rank 3]: GEN 1:1" in content
    assert "🎯 [TARGET] 3️⃣ Rank 3 (Score: 0.7800): GEN 1:1" in content

    # Direct Hits checks
    assert "Direct Hits" in content
    assert "Query `q1`: *\"peace of God\"* (Score: `0.8900`)" in content


def test_subclass_override_renderer(tmp_path: Path) -> None:
    class CustomReport(BaseRetrievalReport):
        def render_item(self, idx: int) -> tuple[str, str]:
            return f"Header {idx}", f"Body {idx}"

    report = CustomReport(
        diagnostics=[{"id": "q1", "query": "test", "target_chunk_idx": 5, "target_rank": 1}],
        metrics={},
    )
    out_file = tmp_path / "custom.md"
    report.generate(out_file)

    content = out_file.read_text()
    assert "Header 5" in content
    assert "Body 5" in content


def test_missing_renderer_raises() -> None:
    report = BaseRetrievalReport(diagnostics=[], metrics={})
    with pytest.raises(NotImplementedError):
        report.render_item(0)


def test_format_passage_citation() -> None:
    ordered_verses = [
        (("GEN", 1, 1), "In the beginning,"),
        (("GEN", 1, 2), "the earth was formless,"),
        (("GEN", 2, 1), "Thus the heavens were finished,"),
    ]

    p_same_chapter = Passage(book="GEN", start_idx=0, end_idx=2, headings=("Creation",))
    hdr, txt = format_passage(p_same_chapter, ordered_verses)
    assert hdr == "[GEN 1:1–2] — Creation"
    assert txt == "In the beginning, the earth was formless,"

    p_cross_chapter = Passage(book="GEN", start_idx=0, end_idx=3, headings=())
    hdr2, txt2 = format_passage(p_cross_chapter, ordered_verses)
    assert hdr2 == "[GEN 1:1–2:1]"
    assert "Thus the heavens were finished," in txt2
