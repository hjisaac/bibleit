from abc import ABC, abstractmethod
from typing import Iterator, Sequence

from rag_core.renderers import BaseChunkRenderer
from .constants import BOOK_NAMES
from .types import Passage, VerseAddress


class BasePassageRenderer(BaseChunkRenderer[Passage], ABC):
    """Base class providing scripture text extraction and address resolution."""

    def __init__(
        self,
        ordered_verses: Sequence[tuple[VerseAddress, str]],
        address_index: dict[VerseAddress, int] | None = None,
        **kwargs,
    ):
        self.ordered_verses = ordered_verses
        self.address_index = address_index

    def get_text(self, start_idx: int, end_idx: int) -> str:
        """Extracts and joins verse texts across an index slice."""
        return " ".join(self.ordered_verses[k][1] for k in range(start_idx, end_idx))

    def format_address(self, start_idx: int, end_idx: int) -> str:
        """Formats canonical scripture citation range (e.g. '[Genesis 1:1–3]')."""
        start_v = self.ordered_verses[start_idx][0]
        end_v = self.ordered_verses[end_idx - 1][0]
        book_name = BOOK_NAMES.get(start_v[0], start_v[0])
        if start_v[1] == end_v[1]:
            if start_v[2] == end_v[2]:
                return f"[{book_name} {start_v[1]}:{start_v[2]}]"
            return f"[{book_name} {start_v[1]}:{start_v[2]}–{end_v[2]}]"
        return f"[{book_name} {start_v[1]}:{start_v[2]}–{end_v[1]}:{end_v[2]}]"

    def iter_sections(self, passage: Passage) -> Iterator[tuple[int, int, str | None]]:
        """Yields (start_idx, end_idx, heading) for each constituent section."""
        if not passage.sections:
            heading = passage.headings[0] if passage.headings else None
            yield (passage.start_idx, passage.end_idx, heading)
            return

        for i, (sec_start, heading) in enumerate(passage.sections):
            sec_end = (
                passage.sections[i + 1][0]
                if i + 1 < len(passage.sections)
                else passage.end_idx
            )
            yield (sec_start, sec_end, heading)

    @abstractmethod
    def render(self, passage: Passage) -> str:
        ...


class TextOnlyRenderer(BasePassageRenderer):
    """Renders raw verse text with no headings or citations."""

    def render(self, passage: Passage) -> str:
        blocks = [
            self.get_text(sec_start, sec_end)
            for sec_start, sec_end, _ in self.iter_sections(passage)
        ]
        return "\n\n".join(blocks)


class HeadingAndTextRenderer(BasePassageRenderer):
    """Renders section headings above verse texts."""

    def render(self, passage: Passage) -> str:
        blocks: list[str] = []
        for sec_start, sec_end, heading in self.iter_sections(passage):
            text = self.get_text(sec_start, sec_end)
            blocks.append(f"{heading}\n{text}" if heading else text)
        return "\n\n".join(blocks)


class BookAndHeadingRenderer(BasePassageRenderer):
    """Grounds canonical book name ('Genesis — Heading') above verse texts."""

    def render(self, passage: Passage) -> str:
        book_name = BOOK_NAMES.get(passage.book, passage.book)
        blocks: list[str] = []
        for i, (sec_start, sec_end, heading) in enumerate(self.iter_sections(passage)):
            text = self.get_text(sec_start, sec_end)
            if heading:
                header = f"{book_name} — {heading}"
            elif i == 0:
                header = book_name
            else:
                header = None
            blocks.append(f"{header}\n{text}" if header else text)
        return "\n\n".join(blocks)


class AddressAndHeadingRenderer(BasePassageRenderer):
    """Renders full citation address ('[Genesis 1:1–3] Heading') above verse texts."""

    def render(self, passage: Passage) -> str:
        blocks: list[str] = []
        for sec_start, sec_end, heading in self.iter_sections(passage):
            addr = self.format_address(sec_start, sec_end)
            header = f"{addr} {heading}" if heading else addr
            text = self.get_text(sec_start, sec_end)
            blocks.append(f"{header}\n{text}")
        return "\n\n".join(blocks)


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
    **kwargs,
) -> BasePassageRenderer:
    """Factory resolving a dedicated renderer subclass by strategy name."""
    cls = RENDERER_REGISTRY.get(strategy)
    if not cls:
        raise ValueError(
            f"Unknown render strategy: {strategy}. Expected one of {list(RENDERER_REGISTRY.keys())}"
        )
    return cls(
        ordered_verses=ordered_verses,
        address_index=address_index,
    )


def create_chunk_renderer(
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    address_index: dict[VerseAddress, int] | None = None,
    strategy: str = "heading_and_text",
    **kwargs,
) -> BasePassageRenderer:
    """Backwards-compatible factory returning a dedicated BasePassageRenderer subclass."""
    return get_renderer(
        strategy=strategy,
        ordered_verses=ordered_verses,
        address_index=address_index,
        **kwargs,
    )


ChunkRenderer = create_chunk_renderer
PassageRenderer = BasePassageRenderer
