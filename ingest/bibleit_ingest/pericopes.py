import json
from pathlib import Path
from typing import Sequence

from .chunking import (
    index_verses_by_address,
    load_pericopes,
    load_web_verses,
)
from joblib import Memory

from .constants import BSB_PERICOPES_PATH, CRUCIBLE_CACHE_DIR, USFM_ORDER
from .types import Pericope, PreparedCorpus, VerseAddress, VerseEvent
from .walkers import (
    BookWalker,
    BsbBookWalker,
    BsbCorpusWalker,
    BsbPericopeWalker,
    BSBBookWalker,
)

_memory = Memory(location=str(CRUCIBLE_CACHE_DIR), verbose=0)


def derive_bsb_pericopes(bsb_dir: Path) -> list[Pericope]:
    """Computes pericope spans within BSB's own versification in canonical order."""
    return list(BsbPericopeWalker(bsb_dir).walk())


def save_pericopes(pericopes: Sequence[Pericope], path: Path) -> None:
    """Caches derived pericopes so they don't need re-walking every time --
    regenerable from source, not a hidden dependency."""
    payload = {
        "pericopes": [
            {
                "book": p.book,
                "chapter": p.chapter,
                "verse": p.verse,
                "heading": p.heading,
                "verse_count": p.verse_count,
            }
            for p in pericopes
        ]
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def save_book_order(path: Path) -> None:
    """Saves the canonical 66-book order as its own file -- static, not
    derived from any translation's data."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"book_order": USFM_ORDER}, indent=2))


def project_pericopes(
    bsb_pericopes: Sequence[Pericope],
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> tuple[list[Pericope], list[Pericope]]:
    """Resolves BSB-native pericope boundaries onto target translation verses."""
    addr_index = {addr: i for i, (addr, _) in enumerate(ordered_verses)}
    book_ends = {addr[0]: i + 1 for i, (addr, _) in enumerate(ordered_verses)}

    resolved: list[Pericope] = []
    unresolved: list[Pericope] = []

    for i, p in enumerate(bsb_pericopes):
        start = addr_index.get((p.book, p.chapter, p.verse))
        if start is None:
            unresolved.append(p)
            continue

        end = book_ends.get(p.book, start)
        for nxt in bsb_pericopes[i + 1 :]:
            if nxt.book != p.book:
                break
            nxt_start = addr_index.get((nxt.book, nxt.chapter, nxt.verse))
            if nxt_start is not None:
                end = nxt_start
                break

        resolved.append(
            Pericope(
                book=p.book,
                chapter=p.chapter,
                verse=p.verse,
                heading=p.heading,
                verse_count=end - start,
            )
        )

    return resolved, unresolved


@_memory.cache
def get_or_prepare_corpus(
    web_path: Path,
    bsb_dir: Path,
    bsb_pericopes_path: Path | None = BSB_PERICOPES_PATH,
) -> PreparedCorpus:
    """Prepares and projects pericopes onto target verses, returning the full corpus context."""
    ordered_verses = load_web_verses(web_path)
    address_index = index_verses_by_address(ordered_verses)

    if bsb_pericopes_path and bsb_pericopes_path.exists():
        bsb_native = load_pericopes(bsb_pericopes_path)
    else:
        bsb_native = derive_bsb_pericopes(bsb_dir)

    resolved, _ = project_pericopes(bsb_native, ordered_verses)
    return PreparedCorpus(
        pericopes=resolved,
        ordered_verses=ordered_verses,
        address_index=address_index,
    )

