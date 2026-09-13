import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .constants import USFM_ORDER


@dataclass(frozen=True)
class Pericope:
    """One BSB heading's span, addressed against a translation's own verse list."""

    book: str
    chapter: int
    verse: int  # First verse of this pericope.
    heading: str
    verse_count: int


@dataclass(frozen=True)
class Chunk:
    """One or more pericopes grouped as a single embedding unit. `pericopes`
    keeps the originals recoverable for citation."""

    pericopes: Sequence[Pericope]

    @property
    def verse_count(self) -> int:
        return sum(p.verse_count for p in self.pericopes)

    @property
    def headings(self) -> list[str]:
        """Each pericope's own heading, in order -- never fused into one."""
        return [p.heading for p in self.pericopes]

    @property
    def book(self) -> str:
        return self.pericopes[0].book


class Chunker(ABC):
    """A pluggable rule for grouping one book's pericopes into chunks."""

    @abstractmethod
    def chunk(self, pericopes: Sequence[Pericope]) -> list[Chunk]: ...

    def chunk_bible(
        self, pericopes_by_book: dict[str, list[Pericope]]
    ) -> list[Chunk]:
        """Applies this strategy to every book, in canonical order. Same
        for every subclass, so it lives here once, not per strategy."""
        chunks = []
        for book in USFM_ORDER:
            chunks.extend(self.chunk(pericopes_by_book[book]))
        return chunks


class FloorCeilingMergeChunker(Chunker):
    """Merges pericopes under `floor` verses with their neighbors, never
    past `ceiling`. Pericopes already >= ceiling are left unsplit
    (splitting them is deferred, out of scope here).

    1. A pericope already at floor is its own chunk.
    2. Otherwise merge forward up to the floor, never past the ceiling.
    3. A last-in-book pericope still undersized merges backward instead,
       or stands alone if that would exceed the ceiling.
    """

    DEFAULT_FLOOR = 5  # Placeholder, not a final decision.
    DEFAULT_CEILING = 30  # Placeholder, not a final decision.

    def __init__(self, floor: int = DEFAULT_FLOOR, ceiling: int = DEFAULT_CEILING):
        if floor <= 0 or ceiling <= 0:
            raise ValueError("floor and ceiling must be positive")
        if floor > ceiling:
            raise ValueError("floor cannot exceed ceiling")
        self.floor = floor
        self.ceiling = ceiling

    def chunk(self, pericopes: Sequence[Pericope]) -> list[Chunk]:
        chunks: list[Chunk] = []
        i = 0
        pericopes_count = len(pericopes)

        while i < pericopes_count:
            group = [pericopes[i]]
            size = pericopes[i].verse_count

            # Rule 2: merge forward until the floor is met, or the next
            # merge would break the ceiling.
            while size < self.floor and i + len(group) < pericopes_count:
                nxt = pericopes[i + len(group)]
                if size + nxt.verse_count > self.ceiling:
                    break
                group.append(nxt)
                size += nxt.verse_count

            # Rule 3: last pericope in the book, still undersized, nothing
            # left to pull forward. Try merging backward instead.
            if size < self.floor and i + len(group) == pericopes_count and chunks:
                prev = chunks[-1]
                if prev.verse_count + size <= self.ceiling:
                    chunks[-1] = Chunk(pericopes=[*prev.pericopes, *group])
                    i += len(group)
                    continue

            chunks.append(Chunk(pericopes=group))
            i += len(group)

        return chunks


VerseAddress = tuple[str, int, int]  # (book, chapter, verse)


def load_web_verses(web_path: Path) -> list[tuple[VerseAddress, str]]:
    """Loads every verse from a getbible.net-style WEB JSON file, in
    reading order, as ((book, chapter, verse), text) pairs."""
    web = json.loads(web_path.read_text())
    ordered = []
    for b in web["books"]:
        code = USFM_ORDER[int(b["nr"]) - 1]
        for ch in b["chapters"]:
            for v in ch["verses"]:
                ordered.append(
                    ((code, int(ch["chapter"]), int(v["verse"])), v["text"])
                )
    return ordered


def group_verse_addresses_by_book(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> dict[str, list[VerseAddress]]:
    """Buckets every verse address by book, in reading order -- the shape
    project_pericopes expects for its target translation."""
    by_book: dict[str, list[VerseAddress]] = {b: [] for b in USFM_ORDER}
    for addr, _ in ordered_verses:
        by_book[addr[0]].append(addr)
    return by_book


def index_verses_by_address(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> dict[VerseAddress, int]:
    """Maps each verse address to its position in `ordered_verses`. Build
    once per translation; rebuilding per chunk would be wasted O(n) work."""
    return {addr: i for i, (addr, _) in enumerate(ordered_verses)}


def render_chunk_text(
    chunk: Chunk,
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    address_index: dict[VerseAddress, int],
) -> str:
    """Builds the text fed to the embedder: each pericope's own heading
    followed by its own verses. `ordered_verses` must be every verse of
    one translation in reading order, so a span resolves correctly even
    across a chapter boundary."""
    blocks = []
    for p in chunk.pericopes:
        start = address_index[(p.book, p.chapter, p.verse)]
        verses_text = " ".join(
            ordered_verses[start + k][1] for k in range(p.verse_count)
        )
        blocks.append(f"{p.heading}\n{verses_text}")
    return "\n\n".join(blocks)


def resolve_verse_to_chunk_index(
    address: VerseAddress,
    chunks: Sequence[Chunk],
    address_index: dict[VerseAddress, int],
) -> int | None:
    """Finds which chunk's span contains this verse address. Resolved
    fresh against the real chunk list so it stays valid as chunking
    parameters change."""
    target_pos = address_index.get(address)
    if target_pos is None:
        return None
    for i, chunk in enumerate(chunks):
        for p in chunk.pericopes:
            start = address_index.get((p.book, p.chapter, p.verse))
            if start is None:
                continue
            if start <= target_pos < start + p.verse_count:
                return i
    return None


def load_pericopes_by_book(
    pericopes_path: Path,
) -> dict[str, list[Pericope]]:
    """Reads a pericopes artifact and groups its pericopes by book, each
    list in reading order -- the shape every strategy expects."""
    data = json.loads(pericopes_path.read_text())
    by_book: dict[str, list[Pericope]] = {}
    for p in data["pericopes"]:
        by_book.setdefault(p["book"], []).append(
            Pericope(
                book=p["book"],
                chapter=p["chapter"],
                verse=p["verse"],
                heading=p["heading"],
                verse_count=p["verse_count"],
            )
        )
    return by_book
