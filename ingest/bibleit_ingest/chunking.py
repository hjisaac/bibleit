from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .constants import USFM_ORDER

VerseAddress = tuple[str, int, int]  # (book, chapter, verse)


@dataclass(frozen=True)
class Pericope:
    """One BSB heading's span, addressed against a translation's own verse list."""

    book: str
    chapter: int
    verse: int  # First verse of this pericope.
    heading: str
    verse_count: int
    is_overlap: bool = False


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
    """A pluggable rule for grouping pericopes into chunks."""

    @abstractmethod
    def chunk(self, pericopes: Sequence[Pericope]) -> list[Chunk]: ...


class AdaptiveWindowChunker(Chunker):
    """Merges pericopes under `floor` verses with neighbors, never past `ceiling`.

    Consecutive chunks can share trailing verses from the previous chunk as
    overlap context. Chunks never cross book boundaries.

    Args:
        floor: Minimum verse target a chunk merges forward to satisfy.
        ceiling: Maximum verse limit a chunk will not exceed.
        overlap: Number of trailing verses prepended from the previous chunk.
        ordered_verses: Optional verse list for resolving exact chapter/verse addresses.
        address_index: Optional mapping from verse address to index in ordered_verses.
    """

    DEFAULT_FLOOR = 5
    DEFAULT_CEILING = 30
    DEFAULT_OVERLAP = 0

    def __init__(
        self,
        floor: int = DEFAULT_FLOOR,
        ceiling: int = DEFAULT_CEILING,
        overlap: int = DEFAULT_OVERLAP,
        ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None,
        address_index: dict[VerseAddress, int] | None = None,
    ):
        if floor <= 0 or ceiling <= 0:
            raise ValueError("floor and ceiling must be positive")
        if floor > ceiling:
            raise ValueError("floor cannot exceed ceiling")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
        self.floor = floor
        self.ceiling = ceiling
        self.overlap = overlap
        self.ordered_verses = ordered_verses
        self.address_index = address_index

    def chunk(self, pericopes: Sequence[Pericope]) -> list[Chunk]:
        chunks: list[Chunk] = []
        i = 0
        n = len(pericopes)

        while i < n:
            current_book = pericopes[i].book
            group: list[Pericope] = []
            size = 0

            # Prepend trailing verses from previous chunk if within same book and ceiling
            if self.overlap > 0 and chunks and chunks[-1].book == current_book:
                prev_last_p = chunks[-1].pericopes[-1]
                slice_len = min(self.overlap, prev_last_p.verse_count)
                if slice_len + pericopes[i].verse_count <= self.ceiling:
                    offset = prev_last_p.verse_count - slice_len
                    if self.address_index is not None and self.ordered_verses is not None:
                        prev_idx = self.address_index[(prev_last_p.book, prev_last_p.chapter, prev_last_p.verse)]
                        slice_addr = self.ordered_verses[prev_idx + offset][0]
                        ch, v = slice_addr[1], slice_addr[2]
                    else:
                        ch, v = prev_last_p.chapter, prev_last_p.verse + offset
                    group.append(
                        Pericope(
                            book=current_book,
                            chapter=ch,
                            verse=v,
                            heading=prev_last_p.heading,
                            verse_count=slice_len,
                            is_overlap=True,
                        )
                    )
                    size += slice_len

            # Fresh pericope advancement
            group.append(pericopes[i])
            size += pericopes[i].verse_count
            step = 1

            # Merge forward until floor is met, ceiling is reached, or book boundary reached
            while size < self.floor and (i + step) < n:
                nxt = pericopes[i + step]
                if nxt.book != current_book:
                    break
                if size + nxt.verse_count > self.ceiling:
                    break
                group.append(nxt)
                size += nxt.verse_count
                step += 1

            # Last-in-book backward merge if undersized
            is_last_in_book = (i + step == n) or (pericopes[i + step].book != current_book)
            if size < self.floor and is_last_in_book and chunks and chunks[-1].book == current_book:
                prev = chunks[-1]
                if prev.verse_count + size <= self.ceiling:
                    chunks[-1] = Chunk(pericopes=[*prev.pericopes, *group])
                    i += step
                    continue

            chunks.append(Chunk(pericopes=group))
            i += step

        return chunks


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


def index_verses_by_address(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> dict[VerseAddress, int]:
    """Maps each verse address to its position in `ordered_verses`. Build
    once per translation; rebuilding per chunk would be wasted O(n) work."""
    return {addr: i for i, (addr, _) in enumerate(ordered_verses)}


class ChunkRenderer:
    """Serializes chunks into formatted text strings for embedding models.

    Args:
        ordered_verses: Complete list of translation verses in canonical order.
        address_index: Mapping from (book, chapter, verse) to index in ordered_verses.
        include_headings: Whether to prepend section headings before verse text.
        include_overlap_headings: Whether overlap slices retain their section headings.
    """

    def __init__(
        self,
        ordered_verses: Sequence[tuple[VerseAddress, str]],
        address_index: dict[VerseAddress, int],
        include_headings: bool = True,
        include_overlap_headings: bool = True,
    ):
        self.ordered_verses = ordered_verses
        self.address_index = address_index
        self.include_headings = include_headings
        self.include_overlap_headings = include_overlap_headings

    def render(self, chunk: Chunk) -> str:
        blocks = []
        for p in chunk.pericopes:
            start = self.address_index[(p.book, p.chapter, p.verse)]
            verses_text = " ".join(
                self.ordered_verses[start + k][1] for k in range(p.verse_count)
            )
            show_heading = self.include_headings and (
                not p.is_overlap or self.include_overlap_headings
            )
            if show_heading and p.heading:
                blocks.append(f"{p.heading}\n{verses_text}")
            else:
                blocks.append(verses_text)
        return "\n\n".join(blocks)


def render_chunk_text(
    chunk: Chunk,
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    address_index: dict[VerseAddress, int],
    include_headings: bool = True,
    include_overlap_headings: bool = True,
) -> str:
    """Convenience helper delegating to ChunkRenderer."""
    return ChunkRenderer(
        ordered_verses=ordered_verses,
        address_index=address_index,
        include_headings=include_headings,
        include_overlap_headings=include_overlap_headings,
    ).render(chunk)


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


def load_pericopes(pericopes_path: Path) -> list[Pericope]:
    """Reads a pericopes artifact and returns all pericopes in reading order."""
    data = json.loads(pericopes_path.read_text())
    return [
        Pericope(
            book=p["book"],
            chapter=p["chapter"],
            verse=p["verse"],
            heading=p["heading"],
            verse_count=p["verse_count"],
        )
        for p in data["pericopes"]
    ]
