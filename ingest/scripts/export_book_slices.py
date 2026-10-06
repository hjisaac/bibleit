import json
from pathlib import Path

from bibleit_ingest.constants import BOOK_NAMES, REPO, USFM_ORDER, WEB_PATH

OUT_DIR = REPO / "app/public/data/books"


def export_books() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    web_data = json.loads(WEB_PATH.read_text())

    for book in web_data["books"]:
        usfm_code = USFM_ORDER[book["nr"] - 1]
        book_name = BOOK_NAMES.get(usfm_code, book.get("name", usfm_code))

        chapters_dict: dict[str, list[dict[str, int | str]]] = {}
        for ch in book["chapters"]:
            ch_num = str(ch["chapter"])
            chapters_dict[ch_num] = [
                {"num": int(v["verse"]), "text": v["text"]}
                for v in ch["verses"]
            ]

        payload = {
            "id": usfm_code,
            "name": book_name,
            "chapters": chapters_dict,
        }

        out_path = OUT_DIR / f"{usfm_code}.json"
        out_path.write_text(json.dumps(payload, separators=(",", ":")))

    print(f"Exported {len(web_data['books'])} books to {OUT_DIR}")


if __name__ == "__main__":
    export_books()
