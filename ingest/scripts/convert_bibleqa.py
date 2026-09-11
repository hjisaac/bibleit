"""
Converts the raw BibleQA source (ingest/eval/data/sources/bible_qa_no_context.csv)
into question_to_passage.json's format: one entry per question, its correct
verse address decoded from Verse_Code, no distractor rows, no stripped/
preprocessed text carried over (the answer verse is resolved fresh against
your own clean WEB corpus at eval time, not this file's mangled text).

Verse_Code is 8 digits: 2-digit book number plus 3-digit chapter plus
3-digit verse. For example, "40001018" is book 40, chapter 1, verse 18,
which is Matthew 1:18. This was verified against known examples (Genesis
2:8, Mark 15:25) before writing this script. Book numbering matches this
project's own USFM_ORDER, already used throughout ingest/.

Source: https://github.com/helen-jiahe-zhao/BibleQA. The repo carries no
license, so keep that in mind before reusing this converted file anywhere
outside this project's own local evaluation.

Run from ingest/:
    .venv/bin/python scripts/convert_bibleqa.py
"""
import csv
import json

from bibleit_ingest.constants import REPO, USFM_ORDER

SOURCE = REPO / "ingest/eval/data/sources/bible_qa_no_context.csv"
OUT_PATH = REPO / "ingest/eval/data/question_to_passage.json"


def decode_verse_code(code: str) -> tuple[str, int, int]:
    book_num = int(code[0:2])
    chapter = int(code[2:5])
    verse = int(code[5:8])
    return USFM_ORDER[book_num - 1], chapter, verse


def main():
    with SOURCE.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")
        rows = [r for r in reader if r["Label"] == "1"]

    queries = []
    for i, row in enumerate(rows, start=1):
        book, chapter, verse = decode_verse_code(row["Verse_Code"])
        queries.append(
            {
                "id": f"bq_{i}",
                "type": "question",
                "query": row["Question"].strip(),
                "relevant": [
                    {"book": book, "chapter": chapter, "verse": verse, "relevance": 3}
                ],
            }
        )

    OUT_PATH.write_text(json.dumps({"queries": queries}, indent=2))
    print(f"wrote {len(queries)} queries to {OUT_PATH}")


if __name__ == "__main__":
    main()
