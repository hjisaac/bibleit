"""
Derives pericope boundaries directly from BSB's own USJ files. This is the
canonical source, since BSB is the only translation carrying section
headings at all. Boundaries are computed within BSB's own versification
first, self-contained: no dependency on WEB, on any other translation, or
on any previously run analysis script's output.

A pericope's `verse_count` only describes a span correctly for the
translation it was measured against. `project_pericopes` resolves a
BSB-native pericope list onto another translation's own verse list, for
when you need actual passage text from that translation. Some pericopes
may not resolve there (see the Romans 16 case: BSB and WEB diverge on the
closing doxology's verse numbering, a real manuscript-tradition
difference, not a bug). Those come back separately, not silently dropped.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

from .chunking import Pericope, VerseAddress
from .constants import USFM_ORDER


@dataclass(frozen=True)
class VerseEvent:
    """
    One verse encountered while walking a book, in reading order.
    `heading` is set when a new section heading appeared immediately
    before this verse, and is None for every other verse under that
    heading.
    """

    address: VerseAddress
    heading: str | None = None


class BookWalker(ABC):
    """
    Walks one translation's book file, yielding one VerseEvent per verse
    in reading order. Streamed, not built up into a return value. Subclass
    per source format; the tree shape and marker names vary, but this
    contract doesn't.
    """

    @abstractmethod
    def walk(self, path: Path) -> Iterator[VerseEvent]: ...


class BSBBookWalker(BookWalker):
    """
    Walks one BSB .usj file. Resets its own state on every `walk` call, so
    one instance can be reused across books.
    """

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


def derive_bsb_pericopes(bsb_dir: Path) -> dict[str, list[Pericope]]:
    """
    Computes pericope spans directly within BSB's own versification.
    Self-contained: this is the canonical structure, before any projection
    onto another translation.
    """
    walker = BSBBookWalker()
    by_book: dict[str, list[Pericope]] = {}
    for code in USFM_ORDER:
        addresses: list[VerseAddress] = []
        headings: list[tuple[VerseAddress, str]] = []
        for event in walker.walk(bsb_dir / f"{code}.usj"):
            addresses.append(event.address)
            if event.heading is not None:
                headings.append((event.address, event.heading))

        addr_index = {a: i for i, a in enumerate(addresses)}
        pericopes = []
        for i, (addr, heading) in enumerate(headings):
            start = addr_index[addr]
            end = (
                addr_index[headings[i + 1][0]]
                if i + 1 < len(headings)
                else len(addresses)
            )
            pericopes.append(
                Pericope(
                    book=addr[0],
                    chapter=addr[1],
                    verse=addr[2],
                    heading=heading,
                    verse_count=end - start,
                )
            )
        by_book[code] = pericopes
    return by_book


def save_pericopes(by_book: dict[str, list[Pericope]], path: Path) -> None:
    """
    Saves derived pericopes as a reusable artifact, so they don't need
    re-walking every time. This is a cache of something derive_bsb_pericopes
    can always regenerate from primary sources, not a hidden dependency
    nothing else can reproduce. Pericopes only: canonical book order is a
    separate, static fact, not something this derivation produces. See
    save_book_order.
    """
    pericopes = [
        {
            "book": p.book,
            "chapter": p.chapter,
            "verse": p.verse,
            "heading": p.heading,
            "verse_count": p.verse_count,
        }
        for book_pericopes in by_book.values()
        for p in book_pericopes
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"pericopes": pericopes}, indent=2))


def save_book_order(path: Path) -> None:
    """
    Saves the canonical 66-book order as its own small reference file.
    This is static, not derived from any translation's data, so it doesn't
    belong bundled inside a pericopes artifact.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"book_order": USFM_ORDER}, indent=2))


def project_pericopes(
    bsb_pericopes: dict[str, list[Pericope]],
    target_addresses_by_book: dict[str, Sequence[VerseAddress]],
) -> tuple[dict[str, list[Pericope]], list[Pericope]]:
    """
    Resolves BSB-native pericope boundaries onto another translation's own
    verse list, such as WEB. Returns (resolved pericopes by book,
    unresolved ones). A pericope is unresolved if its starting address
    doesn't exist at all in the target translation.
    """
    resolved: dict[str, list[Pericope]] = {}
    unresolved: list[Pericope] = []

    for book, pericopes in bsb_pericopes.items():
        target_addresses = target_addresses_by_book.get(book, [])
        addr_index = {a: i for i, a in enumerate(target_addresses)}
        book_resolved = []

        for i, p in enumerate(pericopes):
            start = addr_index.get((p.book, p.chapter, p.verse))
            if start is None:
                unresolved.append(p)
                continue

            # The end is the next pericope that does resolve in this
            # target, skipping over any that don't. Not just the very
            # next one.
            end = len(target_addresses)
            for nxt in pericopes[i + 1 :]:
                nxt_start = addr_index.get((nxt.book, nxt.chapter, nxt.verse))
                if nxt_start is not None:
                    end = nxt_start
                    break

            book_resolved.append(
                Pericope(
                    book=p.book,
                    chapter=p.chapter,
                    verse=p.verse,
                    heading=p.heading,
                    verse_count=end - start,
                )
            )

        resolved[book] = book_resolved

    return resolved, unresolved
