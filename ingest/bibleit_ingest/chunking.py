from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .constants import BOOK_NAMES, USFM_ORDER
from .renderers import (
    AddressAndHeadingRenderer,
    BookAndHeadingRenderer,
    HeadingAndTextRenderer,
    PassageRenderer,
    TextOnlyRenderer,
    get_renderer,
)
from .types import Chunk, Passage, Pericope, VerseAddress


class Chunker(ABC):
    """Groups pericopes into passages."""

    @abstractmethod
    def chunk(self, pericopes: Sequence[Pericope]) -> list[Passage]: ...


class AdaptiveWindowChunker(Chunker):
    """Slices Bible verses into passage chunks bounded by floor and ceiling.

    Mechanics:
    1. Takes pericopes (semantic heading sections) as initial candidate chunks.
    2. Optional lead-in overlap: prepends up to `overlap` verses from the prior chunk
       if within the same book and without exceeding `ceiling`.
    3. Forward merge: while the accumulated verse count is strictly below `floor`,
       it merges subsequent pericopes forward, provided they belong to the same book
       and total size does not exceed `ceiling`.
    4. Undersized tail handling: if the final chunk in a book remains below `floor`,
       it merges backward into the preceding chunk (if it fits within `ceiling`).
    5. Single oversize pericopes: pericopes that individually exceed `ceiling`
       are emitted as single monolithic chunks without being sub-divided.
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


class PericopeChunker(Chunker):
    """Chunks strictly per pericope with optional lead-in overlap bounded by ceiling."""

    def __init__(
        self,
        ceiling: int = 30,
        overlap: int = 0,
        ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None,
        address_index: dict[VerseAddress, int] | None = None,
    ):
        if ceiling <= 0:
            raise ValueError("ceiling must be positive")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
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

    def chunk(self, pericopes: Sequence[Pericope]) -> list[Passage]:
        passages: list[Passage] = []
        spans = self._resolve_spans(pericopes)

        for i, p in enumerate(pericopes):
            current_book = p.book
            fresh_start, fresh_end = spans[i]
            fresh_len = p.verse_count

            lead_in = 0
            if self.overlap > 0 and passages and passages[-1].book == current_book:
                prev_passage = passages[-1]
                cand_overlap = min(self.overlap, prev_passage.verse_count)
                if cand_overlap + fresh_len <= self.ceiling:
                    lead_in = cand_overlap

            start_idx = fresh_start - lead_in
            end_idx = fresh_end
            start_addr = self.ordered_verses[start_idx][0] if self.ordered_verses else None
            end_addr = self.ordered_verses[end_idx - 1][0] if self.ordered_verses and end_idx > start_idx else None

            sections: list[tuple[int, str | None]] = []
            if lead_in > 0:
                sections.append((start_idx, None))
            sections.append((fresh_start, p.heading))

            passages.append(
                Passage(
                    book=current_book,
                    start_idx=start_idx,
                    end_idx=end_idx,
                    headings=(p.heading,) if p.heading else (),
                    start_address=start_addr,
                    end_address=end_addr,
                    sections=tuple(sections),
                )
            )

        return passages


def index_verses_by_address(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
) -> dict[VerseAddress, int]:
    """Maps each verse address to its position in ordered_verses."""
    return {addr: i for i, (addr, _) in enumerate(ordered_verses)}


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
