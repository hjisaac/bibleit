"""
Pericope-based chunking strategies: pluggable rules for grouping BSB
pericopes into the units that actually get embedded.

A Pericope is one BSB heading's span (book, chapter, first verse, heading
text, verse count), as produced by ingest/scripts/pericope_sizes.py. A
Chunk is one or more pericopes grouped together for embedding. It never
destroys the original pericope boundaries (see design/vocabulary.md's
chunk-vs-passage distinction); it just decides what gets embedded as one
unit versus shown or cited individually later.

Every strategy operates on one book's pericopes at a time, in reading
order. Callers are responsible for splitting input by book first. No
strategy may merge across a book boundary.
"""

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
    """
    One or more pericopes grouped together as a single embedding unit.

    The original pericopes are never merged away. `pericopes` always lets
    you recover each one's own heading and verse span for citation or
    display, even though `heading`/`verse_count` below describe the group
    as a whole.
    """

    pericopes: Sequence[Pericope]

    @property
    def verse_count(self) -> int:
        return sum(p.verse_count for p in self.pericopes)

    @property
    def headings(self) -> list[str]:
        """
        Each pericope's own heading, kept separate, in reading order.
        Never fused into one label. A chunk grouping several pericopes has
        several headings, not one; picking or labeling is the caller's job.
        """
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
        """
        Applies this strategy to every book, in canonical order, and
        returns one flat list of chunks across the whole Bible.

        This is the same for every subclass regardless of how `chunk()`
        groups pericopes within a book, so it lives here once rather than
        being reimplemented per strategy. Works with any already-resolved
        pericope set; deriving pericopes from a source format or
        projecting them onto a particular translation's verse list is the
        caller's job, not this method's, see pericopes.py.
        """
        chunks = []
        for book in USFM_ORDER:
            chunks.extend(self.chunk(pericopes_by_book[book]))
        return chunks


class FloorCeilingMergeChunker(Chunker):
    """
    Merges pericopes under `floor` verses with their neighbors, without
    ever letting a merge exceed `ceiling` verses.

    Pericopes already at or above `ceiling` on their own are left as
    single, unsplit chunks. Splitting oversized pericopes is out of scope
    for this strategy (see design discussion; deferred deliberately).

    The rule, in order:
      1. If a pericope already meets the floor, it's its own chunk.
      2. Otherwise, merge forward, pulling in as many following pericopes
         as needed to reach the floor, but never past the ceiling.
      3. A pericope with no next one to merge with (last in the book)
         merges backward into the previous chunk instead, if that stays
         under the ceiling. Otherwise it stands alone, undersized.
    """

    DEFAULT_FLOOR = 5  # Placeholder test value, not a final decision.
    DEFAULT_CEILING = 30  # Placeholder test value, not a final decision.

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
    """
    Loads every verse from a getbible.net-style WEB JSON file, in reading
    order, as ((book, chapter, verse), text) pairs. This is the single
    canonical loader; every script used to duplicate this loop itself.
    """
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
    """
    Buckets every verse address by its book, in reading order. This is
    the shape project_pericopes expects for its target translation, so a
    caller resolving pericopes onto a translation's own versification
    doesn't need to build this grouping by hand each time.
    """
    by_book: dict[str, list[VerseAddress]] = {b: [] for b in USFM_ORDER}
    for addr, _ in ordered_verses:
        by_book[addr[0]].append(addr)
    return by_book


def index_verses_by_address(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> dict[VerseAddress, int]:
    """
    Maps each verse address to its position in `ordered_verses`. Build
    this once per translation and reuse it across every chunk's rendering.
    Rebuilding it per chunk would be wasted O(n) work for every single
    chunk.
    """
    return {addr: i for i, (addr, _) in enumerate(ordered_verses)}


def render_chunk_text(
    chunk: Chunk,
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    address_index: dict[VerseAddress, int],
) -> str:
    """
    Builds the text actually fed to the embedder: each pericope's own
    heading followed by its own verses, then the next pericope's heading
    followed by its verses, and so on. This is the way the passage
    actually reads in the Bible, not headings and text pulled apart into
    separate lists.

    `ordered_verses` must be every verse of one translation, in reading
    order, as ((book, chapter, verse), text) pairs. This is what makes a
    pericope's span resolve correctly even when it crosses a chapter
    boundary, since verse numbers alone reset every chapter and can't be
    walked by simple arithmetic.
    """
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
    """
    Finds which chunk's span currently contains this verse address.
    Resolved fresh each time against the real chunk list, not a fixed
    lookup, so ground truth built from it stays valid as chunking
    parameters change. No library does this; it's specific to your own
    chunk boundaries.
    """
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
    """
    Reads a pericopes artifact (for example,
    ingest/data/derived/bsb_pericopes.json) and groups its pericopes by
    book, each list in reading order. This is the shape every strategy
    expects. Book keys come from the pericopes themselves, not from a
    separate book-order file. This loader doesn't need canonical order,
    only grouping; callers that need canonical order have their own
    book_order.json for that.
    """
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
