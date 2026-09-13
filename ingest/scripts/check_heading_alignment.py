import json
import os
import glob
from multiprocessing import Pool
from pathlib import Path

from bibleit_ingest.chunking import load_web_verses
from bibleit_ingest.constants import BSB_DIR, OLD_TESTAMENT_BOOKS, USFM_ORDER, WEB_PATH
from bibleit_ingest.pericopes import BSBBookWalker

SCRIPT_DIR = Path(__file__).resolve().parent
OUT_PATH = SCRIPT_DIR / "heading_alignment.json"


def testament_of(book: str) -> str:
    return "OT" if book in OLD_TESTAMENT_BOOKS else "NT"


def worker(path: str):
    book = os.path.basename(path).replace(".usj", "")
    headings = [
        (ev.address[1], ev.address[2], ev.heading)
        for ev in BSBBookWalker().walk(Path(path))
        if ev.heading is not None
    ]
    return book, headings


def main():
    paths = sorted(
        glob.glob(str(BSB_DIR / "*.usj")),
        key=lambda p: USFM_ORDER.index(os.path.basename(p).replace(".usj", "")),
    )
    with Pool(processes=os.cpu_count()) as pool:
        results = pool.map(worker, paths)

    web_addrs = {addr for addr, _ in load_web_verses(WEB_PATH)}

    records = []
    for book, headings in results:
        for ch, v, text in headings:
            hit = (book, ch, v) in web_addrs
            records.append({
                "bible_name": "bsb",
                "testament": testament_of(book),
                "book": book,
                "chapter": ch,
                "verse": v,
                "heading": text,
                "hit_in_web": hit,
            })

    total = len(records)
    hits = sum(1 for r in records if r["hit_in_web"])
    misses = [r for r in records if not r["hit_in_web"]]

    summary = {
        "total_headings": total,
        "hits": hits,
        "misses": len(misses),
        "hit_rate": round(hits / total, 4) if total else None,
    }

    with open(OUT_PATH, "w") as f:
        json.dump({"summary": summary, "records": records}, f, indent=2)

    print(json.dumps(summary, indent=2))
    print(f"\nmisses ({len(misses)}):")
    for m in misses:
        print(f"  {m['book']} {m['chapter']}:{m['verse']}  \"{m['heading']}\"")
    print(f"\nfull results written to {OUT_PATH}")


if __name__ == "__main__":
    main()
