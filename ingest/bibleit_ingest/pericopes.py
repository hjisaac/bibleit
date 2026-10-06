import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, NamedTuple, Sequence

from .chunking import (
    Pericope,
    VerseAddress,
    index_verses_by_address,
    load_pericopes,
    load_web_verses,
)
from joblib import Memory

from .constants import BSB_PERICOPES_PATH, CRUCIBLE_CACHE_DIR, USFM_ORDER

_memory = Memory(location=str(CRUCIBLE_CACHE_DIR), verbose=0)


class PreparedCorpus(NamedTuple):
    pericopes: list[Pericope]
    ordered_verses: list[tuple[VerseAddress, str]]
    address_index: dict[VerseAddress, int]


@dataclass(frozen=True)
class VerseEvent:
    """One verse encountered while walking a book. `heading` is set only
    when a new section heading appeared immediately before it."""

    address: VerseAddress
    heading: str | None = None


class BookWalker(ABC):
    """Walks one translation's book file, yielding one VerseEvent per
    verse. Subclass per source format."""

    @abstractmethod
    def walk(self, path: Path) -> Iterator[VerseEvent]: ...


class BSBBookWalker(BookWalker):
    """Walks one BSB .usj file. Resets state each call, so one instance
    can be reused across books."""

    def walk(self, path: Path) -> Iterator[VerseEvent]:
        self._book = path.stem
        self._ch: int | None = None
        self._pending_heading: str | None = None

        doc = json.loads(path.read_text())
        yield from self.visit(doc["content"])

    def visit(self, node) -> Iterator[VerseEvent]:
        if isinstance(node, list):
            for c in node:
                yield from self.visit(c)
            return
        if not isinstance(node, dict):
            return
        if node.get("type") == "chapter":
            self._ch = int(node["number"])
        elif node.get("marker") == "s1":
            self._pending_heading = "".join(
                c for c in node.get("content", []) if isinstance(c, str)
            ).strip()
        elif node.get("type") == "verse":
            n = str(node["number"]).split("-")[-1].split(",")[-1]
            addr = (self._book, self._ch, int(n))
            heading, self._pending_heading = self._pending_heading, None
            yield VerseEvent(address=addr, heading=heading)
        for c in node.get("content", []):
            yield from self.visit(c)


def derive_bsb_pericopes(bsb_dir: Path) -> list[Pericope]:
    """Computes pericope spans within BSB's own versification in canonical order."""
    walker = BSBBookWalker()
    all_pericopes: list[Pericope] = []
    for code in USFM_ORDER:
        addresses: list[VerseAddress] = []
        headings: list[tuple[VerseAddress, str]] = []
        for event in walker.walk(bsb_dir / f"{code}.usj"):
            addresses.append(event.address)
            if event.heading is not None:
                headings.append((event.address, event.heading))

        addr_index = {a: i for i, a in enumerate(addresses)}
        for i, (addr, heading) in enumerate(headings):
            start = addr_index[addr]
            end = (
                addr_index[headings[i + 1][0]]
                if i + 1 < len(headings)
                else len(addresses)
            )
            all_pericopes.append(
                Pericope(
                    book=addr[0],
                    chapter=addr[1],
                    verse=addr[2],
                    heading=heading,
                    verse_count=end - start,
                )
            )
    return all_pericopes


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

