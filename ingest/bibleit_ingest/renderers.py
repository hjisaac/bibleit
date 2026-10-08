from abc import ABC, abstractmethod
from typing import Sequence

from rag_core.renderers import BaseChunkRenderer
from .constants import BOOK_NAMES
from .types import Passage, VerseAddress


class BasePassageRenderer(BaseChunkRenderer[Passage], ABC):
    """Base class for scripture passage rendering strategies."""

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

    def _format_address(self, start_idx: int, end_idx: int) -> str:
        start_v = self.ordered_verses[start_idx][0]
        end_v = self.ordered_verses[end_idx - 1][0]
        book_name = BOOK_NAMES.get(start_v[0], start_v[0])
        if start_v[1] == end_v[1]:
            if start_v[2] == end_v[2]:
                return f"[{book_name} {start_v[1]}:{start_v[2]}]"
            return f"[{book_name} {start_v[1]}:{start_v[2]}–{end_v[2]}]"
        return f"[{book_name} {start_v[1]}:{start_v[2]}–{end_v[1]}:{end_v[2]}]"

    @abstractmethod
    def _format_header(
        self,
        heading: str | None,
        start_idx: int,
        end_idx: int,
        book: str,
        is_first: bool = False,
    ) -> str | None:
        ...

    def render(self, passage: Passage) -> str:
        if not passage.sections:
            text = " ".join(
                self.ordered_verses[k][1] for k in range(passage.start_idx, passage.end_idx)
            )
            heading = passage.headings[0] if passage.headings else None
            header = self._format_header(
                heading, passage.start_idx, passage.end_idx, passage.book, is_first=True
            )
            return f"{header}\n{text}" if header else text

        blocks: list[str] = []
        for i, (sec_start, heading) in enumerate(passage.sections):
            sec_end = (
                passage.sections[i + 1][0]
                if i + 1 < len(passage.sections)
                else passage.end_idx
            )
            sec_text = " ".join(
                self.ordered_verses[k][1] for k in range(sec_start, sec_end)
            )
            header = self._format_header(
                heading, sec_start, sec_end, passage.book, is_first=(i == 0)
            )
            if header:
                blocks.append(f"{header}\n{sec_text}")
            else:
                blocks.append(sec_text)
        return "\n\n".join(blocks)


class TextOnlyRenderer(BasePassageRenderer):
    """Renders raw verse text with no headings or citations."""

    def _format_header(
        self,
        heading: str | None,
        start_idx: int,
        end_idx: int,
        book: str,
        is_first: bool = False,
    ) -> str | None:
        return None


class HeadingAndTextRenderer(BasePassageRenderer):
    """Baseline renderer with section/pericope headings on top of verse texts."""

    def _format_header(
        self,
        heading: str | None,
        start_idx: int,
        end_idx: int,
        book: str,
        is_first: bool = False,
    ) -> str | None:
        return heading if self.include_headings else None


class BookAndHeadingRenderer(BasePassageRenderer):
    """Grounds canonical book name ('Genesis — Heading') with verse texts."""

    def _format_header(
        self,
        heading: str | None,
        start_idx: int,
        end_idx: int,
        book: str,
        is_first: bool = False,
    ) -> str | None:
        book_name = BOOK_NAMES.get(book, book)
        if heading and self.include_headings:
            return f"{book_name} — {heading}"
        return book_name if is_first else None


class AddressAndHeadingRenderer(BasePassageRenderer):
    """Renders full citation address ('[Genesis 1:1–3] Heading') with verse texts."""

    def _format_header(
        self,
        heading: str | None,
        start_idx: int,
        end_idx: int,
        book: str,
        is_first: bool = False,
    ) -> str | None:
        addr = self._format_address(start_idx, end_idx)
        if heading and self.include_headings:
            return f"{addr} {heading}"
        return addr


RENDERER_REGISTRY: dict[str, type[BasePassageRenderer]] = {
    "text_only": TextOnlyRenderer,
    "heading_and_text": HeadingAndTextRenderer,
    "book_and_heading": BookAndHeadingRenderer,
    "address_and_heading": AddressAndHeadingRenderer,
}


def get_renderer(
    strategy: str,
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    address_index: dict[VerseAddress, int] | None = None,
    include_headings: bool = True,
    include_incomplete_headings: bool = True,
) -> BasePassageRenderer:
    """Factory function resolving a dedicated renderer subclass by strategy name."""
    cls = RENDERER_REGISTRY.get(strategy)
    if not cls:
        raise ValueError(
            f"Unknown render strategy: {strategy}. Expected one of {list(RENDERER_REGISTRY.keys())}"
        )
    return cls(
        ordered_verses=ordered_verses,
        address_index=address_index,
        include_headings=include_headings,
        include_incomplete_headings=include_incomplete_headings,
    )
