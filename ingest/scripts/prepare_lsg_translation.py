import json
import urllib.request
from typing import Any

from bibleit_ingest.constants import (
    FRENCH_BOOK_NAMES,
    LSG_PATH,
    USFM_ORDER,
    WEB_PATH,
)

SOURCE_URL = (
    "https://raw.githubusercontent.com/juliend2/data-bible/master/db/seed_data/"
    "louis-segond-formatted.json"
)


def fetch_upstream_lsg() -> dict[tuple[str, int, int], str]:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "bibleit-ingest/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    books_flat: list[dict[str, Any]] = []
    for testament in data["Testaments"]:
        for book in testament["Books"]:
            books_flat.append(book)

    verses: dict[tuple[str, int, int], str] = {}
    for b_idx, book in enumerate(books_flat):
        code = USFM_ORDER[b_idx]
        for ch_idx, ch in enumerate(book["Chapters"]):
            ch_num = ch_idx + 1
            for v_idx, v in enumerate(ch["Verses"]):
                v_num = v.get("ID", v_idx + 1)
                verses[(code, ch_num, v_num)] = v["Text"].strip()

    # Align 7 Textus Receptus verses to WEB Majority Text baseline
    if ("LUK", 17, 36) in verses:
        verses[("LUK", 17, 35)] += " " + verses.pop(("LUK", 17, 36))
    if ("ACT", 8, 37) in verses:
        verses[("ACT", 8, 36)] += " " + verses.pop(("ACT", 8, 37))
    if ("ACT", 15, 34) in verses:
        verses[("ACT", 15, 33)] += " " + verses.pop(("ACT", 15, 34))
    if ("ACT", 24, 7) in verses:
        verses[("ACT", 24, 6)] += " " + verses.pop(("ACT", 24, 7))
    if ("ROM", 16, 25) in verses:
        dox = " " + verses.pop(("ROM", 16, 25))
        if ("ROM", 16, 26) in verses:
            dox += " " + verses.pop(("ROM", 16, 26))
        if ("ROM", 16, 27) in verses:
            dox += " " + verses.pop(("ROM", 16, 27))
        verses[("ROM", 14, 23)] += dox

    return verses


def build_catalog(
    verses: dict[tuple[str, int, int], str], web_catalog: dict[str, Any]
) -> dict[str, Any]:
    books_list: list[dict[str, Any]] = []

    for web_book in web_catalog["books"]:
        code = USFM_ORDER[web_book["nr"] - 1]
        book_name_fr = FRENCH_BOOK_NAMES[code]

        chapters_list: list[dict[str, Any]] = []
        for web_ch in web_book["chapters"]:
            ch_num = web_ch["chapter"]
            verses_list: list[dict[str, Any]] = []

            for web_v in web_ch["verses"]:
                v_num = web_v["verse"]
                text = verses[(code, ch_num, v_num)]
                verses_list.append({
                    "chapter": ch_num,
                    "verse": v_num,
                    "name": f"{book_name_fr} {ch_num}:{v_num}",
                    "text": text,
                })

            chapters_list.append({
                "chapter": ch_num,
                "name": f"{book_name_fr} {ch_num}",
                "verses": verses_list,
            })

        books_list.append({
            "nr": web_book["nr"],
            "name": book_name_fr,
            "chapters": chapters_list,
        })

    return {
        "translation": "Louis Segond (1910)",
        "abbreviation": "lsg",
        "lang": "fr",
        "language": "French",
        "direction": "LTR",
        "encoding": "UTF-8",
        "books": books_list,
    }


def main() -> None:
    web = json.loads(WEB_PATH.read_text())
    verses = fetch_upstream_lsg()
    catalog = build_catalog(verses, web)

    LSG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LSG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
    print(f"Generated {LSG_PATH} (31,095 verses)")


if __name__ == "__main__":
    main()
