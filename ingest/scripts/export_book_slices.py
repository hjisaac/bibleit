import json
import zlib
from pathlib import Path
from typing import Any

from bibleit_ingest.constants import (
    BOOK_NAMES,
    FRENCH_BOOK_NAMES,
    LSG_PATH,
    REPO,
    USFM_ORDER,
    WEB_PATH,
)

OUT_DIR = REPO / "app/public/data/books"


def export_translation_slices(
    catalog_path: Path,
    trans_id: str,
    names_dict: dict[str, str],
    is_default: bool = False,
) -> dict[str, Any]:
    catalog = json.loads(catalog_path.read_text())
    trans_dir = OUT_DIR / trans_id
    trans_dir.mkdir(parents=True, exist_ok=True)

    manifest_books: dict[str, dict[str, Any]] = {}
    total_bytes = 0

    for book in catalog["books"]:
        usfm_code = USFM_ORDER[book["nr"] - 1]
        book_name = names_dict.get(usfm_code, book.get("name", usfm_code))

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

        content_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        size = len(content_bytes)
        crc32 = f"{zlib.crc32(content_bytes) & 0xffffffff:08x}"

        # Write translation-scoped slice: data/books/<trans_id>/<USFM>.json
        (trans_dir / f"{usfm_code}.json").write_bytes(content_bytes)

        # If default, write legacy path: data/books/<USFM>.json
        if is_default:
            (OUT_DIR / f"{usfm_code}.json").write_bytes(content_bytes)

        manifest_books[usfm_code] = {"id": usfm_code, "size": size, "crc32": crc32}
        total_bytes += size

    return {
        "translation": trans_id.upper(),
        "name": catalog.get("translation", trans_id),
        "totalBytes": total_bytes,
        "bookCount": len(manifest_books),
        "books": manifest_books,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    web_dir = OUT_DIR / "web"
    web_dir.mkdir(parents=True, exist_ok=True)

    print("Syncing canonical WEB book slices...")
    for json_file in OUT_DIR.glob("*.json"):
        (web_dir / json_file.name).write_bytes(json_file.read_bytes())
    print("Synced WEB slices to data/books/web/")

    print("Exporting LSG book slices...")
    lsg_manifest = export_translation_slices(LSG_PATH, "lsg", FRENCH_BOOK_NAMES, is_default=False)
    print(f"Exported LSG ({lsg_manifest['totalBytes']} bytes)")

    ts_content = f"import type {{ BibleManifest }} from './bible-manifest';\n\nexport const LSG_BIBLE_MANIFEST: BibleManifest = {json.dumps(lsg_manifest, indent=2)};\n"
    manifest_ts_path = REPO / "app/src/core/lsg-manifest.ts"
    manifest_ts_path.write_text(ts_content)
    print(f"Wrote {manifest_ts_path}")


if __name__ == "__main__":
    main()
