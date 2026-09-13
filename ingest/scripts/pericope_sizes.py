import json
import statistics as st
from pathlib import Path

from bibleit_ingest.chunking import load_web_verses
from bibleit_ingest.constants import BOOK_NAMES, OLD_TESTAMENT_BOOKS, USFM_ORDER, WEB_PATH

SCRIPT_DIR = Path(__file__).resolve().parent
ALIGNMENT_PATH = SCRIPT_DIR / "heading_alignment.json"
OUT_PATH = SCRIPT_DIR / "pericope_sizes.json"


def main():
    alignment = json.load(open(ALIGNMENT_PATH))

    web_addrs = [addr for addr, _ in load_web_verses(WEB_PATH)]
    addr_index = {a: i for i, a in enumerate(web_addrs)}

    recs = sorted(
        alignment["records"],
        key=lambda r: (USFM_ORDER.index(r["book"]), r["chapter"], r["verse"]),
    )

    pericopes = []
    for i, r in enumerate(recs):
        start = addr_index.get((r["book"], r["chapter"], r["verse"]))
        if start is None:
            continue  # The one known miss (ROM 16:25); it has no WEB start point.
        if i + 1 < len(recs):
            nxt = recs[i + 1]
            end = addr_index.get((nxt["book"], nxt["chapter"], nxt["verse"]))
            if end is None:
                end = start + 1
        else:
            end = len(web_addrs)
        pericopes.append({
            "book": r["book"],
            "book_name": BOOK_NAMES[r["book"]],
            "testament": "OT" if r["book"] in OLD_TESTAMENT_BOOKS else "NT",
            "chapter": r["chapter"],
            "verse": r["verse"],
            "heading": r["heading"],
            "verse_count": end - start,
        })

    sizes = [p["verse_count"] for p in pericopes]
    per_book = {}
    for code in USFM_ORDER:
        book_pericopes = [p for p in pericopes if p["book"] == code]
        per_book[code] = {
            "book_name": BOOK_NAMES[code],
            "testament": "OT" if code in OLD_TESTAMENT_BOOKS else "NT",
            "heading_count": len(book_pericopes),
            "mean_verse_count": round(st.mean(p["verse_count"] for p in book_pericopes), 1)
                if book_pericopes else None,
        }

    summary = {
        "total_pericopes": len(sizes),
        "min": min(sizes),
        "max": max(sizes),
        "mean": round(st.mean(sizes), 2),
        "median": st.median(sizes),
        "stdev": round(st.stdev(sizes), 2),
        "count_le_2": sum(1 for n in sizes if n <= 2),
        "count_le_3": sum(1 for n in sizes if n <= 3),
        "count_le_5": sum(1 for n in sizes if n <= 5),
        "count_gt_30": sum(1 for n in sizes if n > 30),
    }

    out = {
        "summary": summary,
        "per_book": per_book,
        "book_order": USFM_ORDER,
        "pericopes": pericopes,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)

    print(json.dumps(summary, indent=2))
    print(f"\nwritten to {OUT_PATH}")


if __name__ == "__main__":
    main()
