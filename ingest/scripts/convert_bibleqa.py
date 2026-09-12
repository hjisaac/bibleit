import csv
import json

from bibleit_ingest.constants import REPO, USFM_ORDER

SOURCE = REPO / "ingest/eval_engine/eval/data/sources/bible_qa_no_context.csv"
OUT_PATH = REPO / "ingest/eval_engine/eval/data/question_to_passage.json"


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
