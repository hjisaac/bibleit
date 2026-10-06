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
    """Canonical section heading and verse span defined by BSB translators."""

    book: str
    chapter: int
    verse: int
    heading: str
    verse_count: int


@dataclass(frozen=True)
class Passage:
    """A contiguous span of verses in reading order within a single book."""

    book: str
    start_idx: int
    end_idx: int
    headings: tuple[str, ...] = ()
    start_address: VerseAddress | None = None
    end_address: VerseAddress | None = None
    sections: tuple[tuple[int, str | None], ...] = ()

    @property
    def verse_count(self) -> int:
        return self.end_idx - self.start_idx

    @property
    def chapter(self) -> int:
        return self.start_address[1] if self.start_address else 0

    @property
    def verse(self) -> int:
        return self.start_address[2] if self.start_address else 0


Chunk = Passage


class Chunker(ABC):
    """Groups pericopes into passages."""

    @abstractmethod
    def chunk(self, pericopes: Sequence[Pericope]) -> list[Passage]: ...


class AdaptiveWindowChunker(Chunker):
    """Slices Bible verses into passage chunks bounded by floor and ceiling.

    Pericopes serve as initial semantic break points. Chunks never cross book
    boundaries. Undersized tails at book ends merge backward into the preceding chunk.
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

    def _resolve_spans(self, pericopes: Sequence[Pericope]) -> list[tuple[int, int]]:
        spans: list[tuple[int, int]] = []
        curr = 0
        for p in pericopes:
            if self.address_index is not None:
                s = self.address_index[(p.book, p.chapter, p.verse)]
            else:
                s = curr
                curr += p.verse_count
            spans.append((s, s + p.verse_count))
        return spans

    def _make_passage(
        self,
        book: str,
        start_idx: int,
        end_idx: int,
        headings: list[str],
        sections: list[tuple[int, str | None]],
    ) -> Passage:
        start_addr = self.ordered_verses[start_idx][0] if self.ordered_verses else None
        end_addr = self.ordered_verses[end_idx - 1][0] if self.ordered_verses and end_idx > start_idx else None
        return Passage(
            book=book,
            start_idx=start_idx,
            end_idx=end_idx,
            headings=tuple(headings),
            start_address=start_addr,
            end_address=end_addr,
            sections=tuple(sections),
        )

    def chunk(self, pericopes: Sequence[Pericope]) -> list[Passage]:
        passages: list[Passage] = []
        spans = self._resolve_spans(pericopes)
        i = 0
        n = len(pericopes)

        while i < n:
            current_book = pericopes[i].book
            fresh_start, fresh_end = spans[i]
            fresh_len = pericopes[i].verse_count

            # Overlap lead-in from previous passage within same book
            overlap_len = 0
            sections: list[tuple[int, str | None]] = []
            if self.overlap > 0 and passages and passages[-1].book == current_book:
                prev = passages[-1]
                cand_overlap = min(self.overlap, prev.verse_count)
                if cand_overlap + fresh_len <= self.ceiling:
                    overlap_len = cand_overlap
                    sections.append((fresh_start - overlap_len, None))

            start_idx = fresh_start - overlap_len
            end_idx = fresh_end
            headings: list[str] = [pericopes[i].heading] if pericopes[i].heading else []
            sections.append((fresh_start, pericopes[i].heading))
            size = end_idx - start_idx
            step = 1

            # Merge forward while under floor and within ceiling and book
            while size < self.floor and (i + step) < n:
                nxt = pericopes[i + step]
                if nxt.book != current_book:
                    break
                if size + nxt.verse_count > self.ceiling:
                    break
                _, nxt_end = spans[i + step]
                end_idx = nxt_end
                size = end_idx - start_idx
                if nxt.heading and nxt.heading not in headings:
                    headings.append(nxt.heading)
                sections.append((spans[i + step][0], nxt.heading))
                step += 1

            # Last-in-book backward merge if undersized
            is_last_in_book = (i + step == n) or (pericopes[i + step].book != current_book)
            if size < self.floor and is_last_in_book and passages and passages[-1].book == current_book:
                prev = passages[-1]
                if prev.verse_count + size <= self.ceiling:
                    merged_headings = list(prev.headings)
                    for h in headings:
                        if h not in merged_headings:
                            merged_headings.append(h)
                    passages[-1] = self._make_passage(
                        book=current_book,
                        start_idx=prev.start_idx,
                        end_idx=end_idx,
                        headings=merged_headings,
                        sections=list(prev.sections) + sections,
                    )
                    i += step
                    continue

            passages.append(self._make_passage(current_book, start_idx, end_idx, headings, sections))
            i += step

        return passages


def load_web_verses(web_path: Path) -> list[tuple[VerseAddress, str]]:
    """Loads every verse from a WEB JSON file in reading order."""
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
    """Maps each verse address to its position in ordered_verses."""
    return {addr: i for i, (addr, _) in enumerate(ordered_verses)}


class ChunkRenderer:
    """Renders passages into formatted text strings for retrieval embedding."""

    def __init__(
        self,
        ordered_verses: Sequence[tuple[VerseAddress, str]],
        address_index: dict[VerseAddress, int] | None = None,
        include_headings: bool = True,
        include_incomplete_headings: bool = True,
    ):
        self.ordered_verses = ordered_verses
        self.address_index = address_index
        self.include_headings = include_headings
        self.include_incomplete_headings = include_incomplete_headings

    def render(self, passage: Passage) -> str:
        if not passage.sections:
            text = " ".join(
                self.ordered_verses[k][1] for k in range(passage.start_idx, passage.end_idx)
            )
            if self.include_headings and passage.headings:
                return f"{passage.headings[0]}\n{text}"
            return text

        blocks: list[str] = []
        for i, (sec_start, heading) in enumerate(passage.sections):
            sec_end = passage.sections[i + 1][0] if i + 1 < len(passage.sections) else passage.end_idx
            sec_text = " ".join(
                self.ordered_verses[k][1] for k in range(sec_start, sec_end)
            )
            if self.include_headings and heading:
                blocks.append(f"{heading}\n{sec_text}")
            else:
                blocks.append(sec_text)
        return "\n\n".join(blocks)


def resolve_verse_to_chunk_index(
    address: VerseAddress,
    chunks: Sequence[Passage],
    address_index: dict[VerseAddress, int],
) -> int | None:
    """Finds which passage contains target verse address via direct index bounds."""
    target_pos = address_index.get(address)
    if target_pos is None:
        return None
    for i, p in enumerate(chunks):
        if p.start_idx <= target_pos < p.end_idx:
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
