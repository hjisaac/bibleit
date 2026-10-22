from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Sequence

from .constants import USFM_ORDER
from .types import BookCorpus, Passage, Pericope, Verse, VerseAddress


class Chunker(ABC):
    """Base orchestrator for chunking Scripture into Passage spans."""

    def __init__(self, corpus: BookCorpus | None = None):
        self.corpus = corpus

    @abstractmethod
    def chunk(
        self,
        pericopes: Sequence[Pericope],
        corpus: BookCorpus | None = None,
    ) -> list[Passage]: ...


def resolve_pericope_for_coordinate(
    pericopes: Sequence[Pericope],
    coord: tuple[int, int],
) -> Pericope | None:
    """Finds the pericope covering coord (i.e. latest pericope with start <= coord)."""
    match = None
    for p in pericopes:
        if p.start <= coord:
            match = p
        else:
            break
    return match


def build_passage_headings(
    pericopes: Sequence[Pericope],
    fresh_verses: Sequence[Verse],
    lead_in_verses: Sequence[Verse] = (),
    include_overlap_heading: bool = True,
) -> tuple[tuple[int, int, str], ...]:
    """Recuperates canonical pericope headings covering the chunk's verses via coordinate lookup."""
    headings: list[tuple[int, int, str]] = []
    seen: set[tuple[int, int, str]] = set()

    if include_overlap_heading and lead_in_verses:
        for v in lead_in_verses:
            p = resolve_pericope_for_coordinate(pericopes, v.coordinate)
            if p and p.heading:
                item = (p.chapter, p.verse, p.heading)
                if item not in seen:
                    seen.add(item)
                    headings.append(item)

    for v in fresh_verses:
        p = resolve_pericope_for_coordinate(pericopes, v.coordinate)
        if p and p.heading:
            item = (p.chapter, p.verse, p.heading)
            if item not in seen:
                seen.add(item)
                headings.append(item)

    return tuple(headings)


class AdaptiveWindowChunker(Chunker):
    """Slices Bible verses into passage chunks bounded by floor and ceiling."""

    DEFAULT_FLOOR = 5
    DEFAULT_CEILING = 30
    DEFAULT_OVERLAP = 0

    def __init__(
        self,
        floor: int = DEFAULT_FLOOR,
        ceiling: int = DEFAULT_CEILING,
        overlap: int = DEFAULT_OVERLAP,
        corpus: BookCorpus | None = None,
        include_overlap_heading: bool = True,
        **kwargs: Any,
    ):
        super().__init__(corpus)
        if floor <= 0 or ceiling <= 0:
            raise ValueError("floor and ceiling must be positive")
        if floor > ceiling:
            raise ValueError("floor cannot exceed ceiling")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
        self.floor = floor
        self.ceiling = ceiling
        self.overlap = overlap
        self.include_overlap_heading = include_overlap_heading

    def chunk_book(
        self,
        book: str,
        pericopes: Sequence[Pericope],
        verses: Sequence[Verse],
    ) -> list[Passage]:
        if not verses:
            return []

        if not pericopes:
            return self._window_verses(book, verses, [(1, 1, book)])

        # 1. Resolve verses for each pericope
        pericope_blocks: list[tuple[Pericope, list[Verse]]] = []
        n_p = len(pericopes)
        for i, p in enumerate(pericopes):
            next_start = pericopes[i + 1].start if i + 1 < n_p else (9999, 9999)
            p_verses = [v for v in verses if p.start <= v.coordinate < next_start]
            if p_verses:
                pericope_blocks.append((p, p_verses))

        if not pericope_blocks:
            return []

        # 2. Window and merge pericope blocks
        passages: list[Passage] = []
        i = 0
        n_b = len(pericope_blocks)

        while i < n_b:
            p, cur_verses = pericope_blocks[i]

            # Oversized pericope handling: subdivide if exceeding ceiling
            if len(cur_verses) > self.ceiling:
                step_size = self.ceiling - self.overlap if self.overlap > 0 else self.ceiling
                for start_v_idx in range(0, len(cur_verses), step_size):
                    sub_slice = cur_verses[start_v_idx : start_v_idx + self.ceiling]
                    if not sub_slice:
                        continue
                    if len(sub_slice) < self.floor and passages and passages[-1].book == book:
                        prev_p = passages[-1]
                        combined_range = self._get_combined_verses(verses, prev_p.start, sub_slice[-1].coordinate)
                        if len(combined_range) <= self.ceiling:
                            passages[-1] = Passage(
                                book=book,
                                start=prev_p.start,
                                end=sub_slice[-1].coordinate,
                                headings=prev_p.headings,
                            )
                            continue
                    heading_items = build_passage_headings(
                        pericopes, fresh_verses=sub_slice, include_overlap_heading=self.include_overlap_heading
                    )
                    if not heading_items:
                        heading_items = ((sub_slice[0].chapter, sub_slice[0].verse, p.heading),)
                    passages.append(
                        Passage(
                            book=book,
                            start=sub_slice[0].coordinate,
                            end=sub_slice[-1].coordinate,
                            headings=heading_items,
                        )
                    )
                i += 1
                continue

            fresh_verses = list(cur_verses)
            step = 1

            while len(fresh_verses) < self.floor and (i + step) < n_b:
                next_p, next_verses = pericope_blocks[i + step]
                if len(fresh_verses) + len(next_verses) > self.ceiling:
                    break
                fresh_verses.extend(next_verses)
                step += 1

            # Lead-in overlap from previous passage in same book
            lead_verses: list[Verse] = []
            if self.overlap > 0 and passages and passages[-1].book == book:
                prev_passage = passages[-1]
                prev_verses = [v for v in verses if prev_passage.start <= v.coordinate <= prev_passage.end]
                cand_lead = min(self.overlap, len(prev_verses))
                if len(fresh_verses) + cand_lead <= self.ceiling and cand_lead > 0:
                    lead_verses = prev_verses[-cand_lead:]

            accum_verses = lead_verses + fresh_verses

            # Backward merge undersized tail at end of book
            is_last = (i + step == n_b)
            if len(accum_verses) < self.floor and is_last and passages and passages[-1].book == book:
                prev_p = passages[-1]
                combined_range = self._get_combined_verses(verses, prev_p.start, accum_verses[-1].coordinate)
                if len(combined_range) <= self.ceiling:
                    comb_headings = build_passage_headings(
                        pericopes, fresh_verses=combined_range, include_overlap_heading=self.include_overlap_heading
                    )
                    if not comb_headings:
                        comb_headings = prev_p.headings
                    passages[-1] = Passage(
                        book=book,
                        start=prev_p.start,
                        end=accum_verses[-1].coordinate,
                        headings=comb_headings,
                    )
                    i += step
                    continue

            headings = build_passage_headings(
                pericopes,
                fresh_verses=fresh_verses,
                lead_in_verses=lead_verses,
                include_overlap_heading=self.include_overlap_heading,
            )
            if not headings:
                first_v = accum_verses[0]
                headings = ((first_v.chapter, first_v.verse, book),)

            passages.append(
                Passage(
                    book=book,
                    start=accum_verses[0].coordinate,
                    end=accum_verses[-1].coordinate,
                    headings=headings,
                )
            )
            i += step

        return passages

    def _get_combined_verses(
        self,
        verses: Sequence[Verse],
        start: tuple[int, int],
        end: tuple[int, int],
    ) -> list[Verse]:
        return [v for v in verses if start <= v.coordinate <= end]

    def _window_verses(
        self,
        book: str,
        verses: Sequence[Verse],
        headings: list[tuple[int, int, str]],
    ) -> list[Passage]:
        step = self.ceiling - self.overlap if self.overlap > 0 else self.ceiling
        passages: list[Passage] = []
        for j in range(0, len(verses), step):
            sub = verses[j : j + self.ceiling]
            if sub:
                passages.append(
                    Passage(
                        book=book,
                        start=sub[0].coordinate,
                        end=sub[-1].coordinate,
                        headings=tuple(headings),
                    )
                )
        return passages

    def chunk(
        self,
        pericopes: Sequence[Pericope],
        corpus: BookCorpus | None = None,
    ) -> list[Passage]:
        effective_corpus = corpus or self.corpus
        if effective_corpus is None:
            raise ValueError("AdaptiveWindowChunker requires a BookCorpus")

        p_by_book: dict[str, list[Pericope]] = {}
        for p in pericopes:
            p_by_book.setdefault(p.book, []).append(p)

        all_passages: list[Passage] = []
        for book_code in USFM_ORDER:
            book_verses = effective_corpus.books.get(book_code, [])
            if not book_verses:
                continue
            book_passages = self.chunk_book(
                book=book_code,
                pericopes=p_by_book.get(book_code, []),
                verses=book_verses,
            )
            all_passages.extend(book_passages)

        return all_passages


class PericopeChunker(Chunker):
    """Chunks strictly per pericope with optional lead-in overlap bounded by ceiling."""

    DEFAULT_CEILING = 30
    DEFAULT_OVERLAP = 0

    def __init__(
        self,
        ceiling: int = DEFAULT_CEILING,
        overlap: int = DEFAULT_OVERLAP,
        corpus: BookCorpus | None = None,
        include_overlap_heading: bool = True,
        **kwargs: Any,
    ):
        super().__init__(corpus)
        if ceiling <= 0:
            raise ValueError("ceiling must be positive")
        if overlap < 0:
            raise ValueError("overlap cannot be negative")
        self.ceiling = ceiling
        self.overlap = overlap
        self.include_overlap_heading = include_overlap_heading

    def chunk(
        self,
        pericopes: Sequence[Pericope],
        corpus: BookCorpus | None = None,
    ) -> list[Passage]:
        effective_corpus = corpus or self.corpus
        if effective_corpus is None:
            raise ValueError("PericopeChunker requires a BookCorpus")

        p_by_book: dict[str, list[Pericope]] = {}
        for p in pericopes:
            p_by_book.setdefault(p.book, []).append(p)

        all_passages: list[Passage] = []
        for book_code in USFM_ORDER:
            verses = effective_corpus.books.get(book_code, [])
            book_ps = p_by_book.get(book_code, [])
            n_p = len(book_ps)

            for i, p in enumerate(book_ps):
                next_start = book_ps[i + 1].start if i + 1 < n_p else (9999, 9999)
                p_verses = [v for v in verses if p.start <= v.coordinate < next_start]
                if not p_verses:
                    continue

                lead_in: list[Verse] = []
                if self.overlap > 0 and all_passages and all_passages[-1].book == book_code:
                    prev = all_passages[-1]
                    prev_verses = [v for v in verses if prev.start <= v.coordinate <= prev.end]
                    count = min(self.overlap, len(prev_verses))
                    if len(p_verses) + count <= self.ceiling:
                        lead_in = prev_verses[-count:]

                chunk_verses = lead_in + p_verses
                headings = build_passage_headings(
                    pericopes=book_ps,
                    fresh_verses=p_verses,
                    lead_in_verses=lead_in,
                    include_overlap_heading=self.include_overlap_heading,
                )
                if not headings:
                    first_v = chunk_verses[0]
                    headings = ((first_v.chapter, first_v.verse, book_code),)

                all_passages.append(
                    Passage(
                        book=book_code,
                        start=chunk_verses[0].coordinate,
                        end=chunk_verses[-1].coordinate,
                        headings=headings,
                    )
                )

        return all_passages


class TokenWindowChunker(Chunker):
    """Slices Bible verses into passage chunks bounded by token ceiling and headroom margin."""

    DEFAULT_CEILING = 512
    DEFAULT_OVERLAP = 0
    # Reserves token budget for renderer-injected headings, citations, and model prefix tokens.
    DEFAULT_HEADROOM_MARGIN = 25

    def __init__(
        self,
        ceiling: int = DEFAULT_CEILING,
        overlap: int = DEFAULT_OVERLAP,
        corpus: BookCorpus | None = None,
        tokenizer: Any = None,
        headroom_margin: int = DEFAULT_HEADROOM_MARGIN,
        include_overlap_heading: bool = True,
        **kwargs: Any,
    ):
        super().__init__(corpus)
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
        self.tokenizer = tokenizer
        self.headroom_margin = headroom_margin
        self.include_overlap_heading = include_overlap_heading

    def _count_tokens(self, text: str) -> int:
        if self.tokenizer is not None:
            encoded = self.tokenizer.encode(text)
            return len(encoded.ids) if hasattr(encoded, "ids") else len(encoded)
        # Heuristic fallback for tests/dry-runs without a model tokenizer:
        # estimates subwords using an empirical English expansion ratio (~1.3 tokens/word).
        return max(1, int(len(text.split()) * 1.3))

    def chunk(
        self,
        pericopes: Sequence[Pericope],
        corpus: BookCorpus | None = None,
    ) -> list[Passage]:
        effective_corpus = corpus or self.corpus
        if effective_corpus is None:
            raise ValueError("TokenWindowChunker requires a BookCorpus")

        p_by_book: dict[str, list[Pericope]] = {}
        for p in pericopes:
            p_by_book.setdefault(p.book, []).append(p)

        effective_ceiling = self.ceiling - self.headroom_margin
        all_passages: list[Passage] = []

        for book_code in USFM_ORDER:
            verses = effective_corpus.books.get(book_code, [])
            if not verses:
                continue

            book_ps = p_by_book.get(book_code, [])
            pericope_map: dict[tuple[int, int], str] = {p.start: p.heading for p in book_ps}
            verse_tokens = [self._count_tokens(v.text) for v in verses]
            total_verses = len(verses)

            fresh_start = 0
            while fresh_start < total_verses:
                accum_tokens = 0
                curr = fresh_start

                while curr < total_verses:
                    v_tok = verse_tokens[curr]
                    if accum_tokens + v_tok > effective_ceiling and curr > fresh_start:
                        break
                    accum_tokens += v_tok
                    curr += 1
                    if (
                        curr < total_verses
                        and verses[curr].coordinate in pericope_map
                        and accum_tokens >= (effective_ceiling // 2)
                    ):
                        break

                fresh_end = curr

                # Calculate overlap verses from previous passage in same book
                lead_in = 0
                if self.overlap > 0 and all_passages and all_passages[-1].book == book_code:
                    prev_passage = all_passages[-1]
                    prev_verses = [v for v in verses if prev_passage.start <= v.coordinate <= prev_passage.end]
                    cand_lead = min(self.overlap, len(prev_verses))
                    if cand_lead > 0:
                        lead_tokens = sum(verse_tokens[fresh_start - cand_lead : fresh_start])
                        if accum_tokens + lead_tokens <= effective_ceiling:
                            lead_in = cand_lead

                chunk_start = fresh_start - lead_in
                chunk_end = fresh_end
                chunk_verses = verses[chunk_start:chunk_end]

                headings = build_passage_headings(
                    pericopes=book_ps,
                    fresh_verses=verses[fresh_start:fresh_end],
                    lead_in_verses=verses[chunk_start:fresh_start],
                    include_overlap_heading=self.include_overlap_heading,
                )
                if not headings:
                    first_v = chunk_verses[0]
                    headings = ((first_v.chapter, first_v.verse, book_code),)

                all_passages.append(
                    Passage(
                        book=book_code,
                        start=verses[chunk_start].coordinate,
                        end=verses[chunk_end - 1].coordinate,
                        headings=headings,
                    )
                )

                fresh_start = fresh_end

        return all_passages


def build_verse_to_chunk_index(
    corpus: BookCorpus,
    chunks: Sequence[Passage],
) -> dict[VerseAddress, list[int]]:
    """Builds an inverted index mapping each verse address to containing chunk indices in O(N)."""
    index: dict[VerseAddress, list[int]] = {}
    for idx, chunk in enumerate(chunks):
        for v in corpus.get_range(chunk.book, chunk.start, chunk.end):
            index.setdefault(v.address, []).append(idx)
    return index


def get_chunker(
    *args: Any,
    corpus: BookCorpus | None = None,
    **kwargs: Any,
) -> Chunker:
    """Instantiates the configured Chunker subclass."""
    strategy = str(args[0] if args else kwargs.pop("strategy", "adaptive"))
    kwargs.pop("strategy", None)
    if strategy == "adaptive":
        return AdaptiveWindowChunker(
            floor=int(kwargs.get("floor", AdaptiveWindowChunker.DEFAULT_FLOOR)),
            ceiling=int(kwargs.get("ceiling", AdaptiveWindowChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", AdaptiveWindowChunker.DEFAULT_OVERLAP)),
            corpus=corpus,
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    if strategy == "pericope":
        return PericopeChunker(
            ceiling=int(kwargs.get("ceiling", PericopeChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", PericopeChunker.DEFAULT_OVERLAP)),
            corpus=corpus,
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    if strategy == "token_window":
        return TokenWindowChunker(
            ceiling=int(kwargs.get("ceiling", TokenWindowChunker.DEFAULT_CEILING)),
            overlap=int(kwargs.get("overlap", TokenWindowChunker.DEFAULT_OVERLAP)),
            corpus=corpus,
            tokenizer=kwargs.get("tokenizer"),
            headroom_margin=int(kwargs.get("headroom_margin", TokenWindowChunker.DEFAULT_HEADROOM_MARGIN)),
            include_overlap_heading=bool(kwargs.get("include_overlap_heading", True)),
        )
    raise ValueError(f"Unknown chunking strategy: '{strategy}'")
