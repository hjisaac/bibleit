from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

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
        include_overlap_heading: bool = True,
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
        self.include_overlap_heading = include_overlap_heading

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
        sections: list[tuple[int, str]],
    ) -> Passage:
        start_addr = self.ordered_verses[start_idx][0] if self.ordered_verses else None
        end_addr = self.ordered_verses[end_idx - 1][0] if self.ordered_verses and end_idx > start_idx else None
        return Passage(
            book=book,
            start_idx=start_idx,
            end_idx=end_idx,
            sections=tuple(sections),
            start_address=start_addr,
            end_address=end_addr,
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
                    if self.include_overlap_heading:
                        lead_heading = pericopes[i - 1].heading if i > 0 and pericopes[i - 1].heading else pericopes[i].heading
                    else:
                        lead_heading = None
                    sections.append((fresh_start - overlap_len, lead_heading))

            start_idx = fresh_start - overlap_len
            end_idx = fresh_end
            sections.append((fresh_start, pericopes[i].heading or None))
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
                sections.append((spans[i + step][0], nxt.heading or None))
                step += 1

            # Last-in-book backward merge if undersized
            is_last_in_book = (i + step == n) or (pericopes[i + step].book != current_book)
            if size < self.floor and is_last_in_book and passages and passages[-1].book == current_book:
                prev = passages[-1]
                if prev.verse_count + size <= self.ceiling:
                    passages[-1] = self._make_passage(
                        book=current_book,
                        start_idx=prev.start_idx,
                        end_idx=end_idx,
                        sections=list(prev.sections) + sections,
                    )
                    i += step
                    continue

            passages.append(self._make_passage(current_book, start_idx, end_idx, sections))
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
        include_overlap_heading: bool = True,
    ):
        if ceiling <= 0:
            raise ValueError("ceiling must be positive")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
        self.ceiling = ceiling
        self.overlap = overlap
        self.ordered_verses = ordered_verses
        self.address_index = address_index
        self.include_overlap_heading = include_overlap_heading

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
                if self.include_overlap_heading:
                    lead_heading = pericopes[i - 1].heading if i > 0 and pericopes[i - 1].heading else p.heading
                else:
                    lead_heading = None
                sections.append((start_idx, lead_heading))
            sections.append((fresh_start, p.heading or None))

            passages.append(
                Passage(
                    book=current_book,
                    start_idx=start_idx,
                    end_idx=end_idx,
                    sections=tuple(sections),
                    start_address=start_addr,
                    end_address=end_addr,
                )
            )

        return passages


class TokenWindowChunker(Chunker):
    """Slices Bible verses into passage chunks bounded by a token ceiling.

    Mechanics:
    1. Accumulates whole verses sequentially up to (ceiling - headroom_margin) tokens.
    2. Respects natural pericope boundaries as preferred clean split points.
    3. If adding a verse exceeds the effective token ceiling, steps back to the previous verse
       unless that single verse is alone (single-verse oversize guard).
    4. Overlap is bounded by overlap verses within the same book boundary.
    5. Headroom margin reserves token budget for downstream renderer headers (mean ~22 tokens).
    """

    DEFAULT_CEILING = 512
    DEFAULT_OVERLAP = 0
    DEFAULT_HEADROOM_MARGIN = 25

    def __init__(
        self,
        ceiling: int = DEFAULT_CEILING,
        overlap: int = DEFAULT_OVERLAP,
        ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None,
        address_index: dict[VerseAddress, int] | None = None,
        tokenizer: Any = None,
        headroom_margin: int = DEFAULT_HEADROOM_MARGIN,
        include_overlap_heading: bool = True,
    ):
        if ceiling <= 0:
            raise ValueError("ceiling must be positive")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
        if headroom_margin < 0:
            raise ValueError("headroom_margin cannot be negative")
        if headroom_margin >= ceiling:
            raise ValueError("headroom_margin cannot meet or exceed ceiling")
        self.ceiling = ceiling
        self.overlap = overlap
        self.ordered_verses = ordered_verses
        self.address_index = address_index
        self.tokenizer = tokenizer
        # Headroom margin reserves budget for prepended book names, headings, and citations
        # so that downstream rendered passages stay strictly <= ceiling tokens.
        self.headroom_margin = headroom_margin
        self.include_overlap_heading = include_overlap_heading

    def _count_tokens(self, text: str) -> int:
        if self.tokenizer is not None:
            if hasattr(self.tokenizer, "encode"):
                return len(self.tokenizer.encode(text))
            if callable(self.tokenizer):
                return len(self.tokenizer(text))
        # Fallback approximation: 1.3 tokens per word
        return max(1, int(len(text.split()) * 1.3))

    def chunk(self, pericopes: Sequence[Pericope]) -> list[Passage]:
        if not pericopes:
            return []
        if not self.ordered_verses:
            raise ValueError("TokenWindowChunker requires ordered_verses to compute token lengths")

        effective_ceiling = self.ceiling - self.headroom_margin
        passages: list[Passage] = []

        # Map each global verse index to its pericope start and heading
        pericope_map: dict[int, tuple[str, str | None]] = {}
        pericope_ends: set[int] = set()
        curr_idx = 0
        for p in pericopes:
            if self.address_index is not None:
                s = self.address_index[(p.book, p.chapter, p.verse)]
            else:
                s = curr_idx
                curr_idx += p.verse_count
            pericope_map[s] = (p.book, p.heading)
            pericope_ends.add(s + p.verse_count)

        # Pre-compute token length for each verse in ordered_verses
        verse_tokens = [self._count_tokens(text) for _, text in self.ordered_verses]
        total_verses = len(self.ordered_verses)

        fresh_start = 0
        while fresh_start < total_verses:
            current_book = self.ordered_verses[fresh_start][0][0]

            # Accumulate fresh verses within current book up to effective_ceiling
            accum_tokens = 0
            curr = fresh_start
            while curr < total_verses and self.ordered_verses[curr][0][0] == current_book:
                v_tok = verse_tokens[curr]
                if accum_tokens + v_tok > effective_ceiling and curr > fresh_start:
                    break
                accum_tokens += v_tok
                curr += 1
                if curr in pericope_ends and accum_tokens >= (effective_ceiling // 2):
                    break

            fresh_end = curr

            # Calculate overlap verses from previous passage if within the same book
            lead_in = 0
            if self.overlap > 0 and passages and passages[-1].book == current_book:
                prev_passage = passages[-1]
                cand_lead = min(self.overlap, fresh_start - prev_passage.start_idx)
                lead_tokens = sum(verse_tokens[fresh_start - cand_lead : fresh_start])
                if accum_tokens + lead_tokens <= effective_ceiling:
                    lead_in = cand_lead

            chunk_start = fresh_start - lead_in
            chunk_end = fresh_end

            # Build sections with heading attribution
            sections: list[tuple[int, str | None]] = []
            for v_idx in range(chunk_start, chunk_end):
                if v_idx in pericope_map:
                    _, heading = pericope_map[v_idx]
                    if v_idx < fresh_start and not self.include_overlap_heading:
                        heading = None
                    sections.append((v_idx, heading))

            if not sections:
                sections.append((chunk_start, None))

            passages.append(
                Passage(
                    book=current_book,
                    start_idx=chunk_start,
                    end_idx=chunk_end,
                    sections=tuple(sections),
                    start_address=self.ordered_verses[chunk_start][0],
                    end_address=self.ordered_verses[chunk_end - 1][0],
                )
            )

            fresh_start = fresh_end

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


def resolve_verse_to_chunk_indices(
    address: VerseAddress,
    chunks: Sequence[Passage],
    address_index: dict[VerseAddress, int],
) -> list[int]:
    """Finds all passage chunks containing the target verse address."""
    target_pos = address_index.get(address)
    if target_pos is None:
        return []
    return [i for i, p in enumerate(chunks) if p.start_idx <= target_pos < p.end_idx]


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


def get_chunker(
    strategy: str = "adaptive",
    *,
    ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None,
    address_index: dict[VerseAddress, int] | None = None,
    tokenizer: Any = None,
    **kwargs: Any,
) -> Chunker:
    """Instantiates the configured Chunker subclass."""
    if strategy == "adaptive":
        return AdaptiveWindowChunker(
            floor=int(kwargs.get("floor", AdaptiveWindowChunker.DEFAULT_FLOOR)),
            ceiling=int(kwargs.get("ceiling", AdaptiveWindowChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", AdaptiveWindowChunker.DEFAULT_OVERLAP)),
            ordered_verses=ordered_verses,
            address_index=address_index,
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    if strategy == "pericope":
        return PericopeChunker(
            ceiling=int(kwargs.get("ceiling", PericopeChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", PericopeChunker.DEFAULT_OVERLAP)),
            ordered_verses=ordered_verses,
            address_index=address_index,
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    if strategy == "token_window":
        return TokenWindowChunker(
            ceiling=int(kwargs.get("ceiling", TokenWindowChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", TokenWindowChunker.DEFAULT_OVERLAP)),
            ordered_verses=ordered_verses,
            address_index=address_index,
            tokenizer=tokenizer,
            headroom_margin=int(kwargs.get("headroom_margin", TokenWindowChunker.DEFAULT_HEADROOM_MARGIN)),
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    raise ValueError(f"Unknown chunking strategy: '{strategy}'")

