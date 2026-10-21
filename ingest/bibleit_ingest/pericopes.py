import json
from pathlib import Path
from typing import Sequence

from .constants import BSB_DIR, BSB_PERICOPES_PATH, USFM_ORDER
from .types import BookCorpus, Pericope
from .walkers import BsbPericopeWalker, WebCorpusWalker


def derive_bsb_pericopes(bsb_dir: Path) -> list[Pericope]:
    """Computes pericopes within BSB in canonical order."""
    return BsbPericopeWalker(bsb_dir).walk()


def save_pericopes(pericopes: Sequence[Pericope], path: Path) -> None:
    """Caches derived pericopes to JSON."""
    payload = {
        "pericopes": [
            {
                "book": p.book,
                "start": list(p.start),
                "heading": p.heading,
            }
            for p in pericopes
        ]
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def load_pericopes(path: Path) -> list[Pericope]:
    """Loads cached pericopes from JSON."""
    data = json.loads(path.read_text())
    return [
        Pericope(
            book=p["book"],
            start=(p["start"][0], p["start"][1]),
            heading=p["heading"],
        )
        for p in data["pericopes"]
    ]


def save_book_order(path: Path) -> None:
    """Saves the canonical 66-book order as its own file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"book_order": USFM_ORDER}, indent=2))


def group_pericopes_by_book(pericopes: Sequence[Pericope]) -> dict[str, list[Pericope]]:
    """Groups a sequence of pericopes into a book-keyed dictionary."""
    grouped: dict[str, list[Pericope]] = {}
    for p in pericopes:
        grouped.setdefault(p.book, []).append(p)
    return grouped


def get_or_prepare_corpus(
    web_path: Path,
    bsb_dir: Path | None = None,
    bsb_pericopes_path: Path | None = BSB_PERICOPES_PATH,
) -> tuple[BookCorpus, list[Pericope]]:
    corpus = BookCorpus.from_verses(WebCorpusWalker(web_path).lazy_walk())

    if bsb_pericopes_path and bsb_pericopes_path.exists():
        pericopes = load_pericopes(bsb_pericopes_path)
    else:
        pericopes = derive_bsb_pericopes(bsb_dir or BSB_DIR)
        if bsb_pericopes_path:
            save_pericopes(pericopes, bsb_pericopes_path)

    return corpus, pericopes
