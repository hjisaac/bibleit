from abc import ABC, abstractmethod
from typing import Sequence

from rag_core.renderers import BaseChunkRenderer
from .constants import BOOK_NAMES
from .types import BookCorpus, Passage


class PassageRenderer(BaseChunkRenderer[Passage], ABC):
    """Base class providing scripture text formatting for Passage retrieval units."""

    def __init__(self, corpus: BookCorpus, **kwargs):
        self.corpus = corpus

    def get_text(self, passage: Passage) -> str:
        """Extracts and joins verse texts across the passage coordinate span."""
        verses = self.corpus.get_range(passage.book, passage.start, passage.end)
        return " ".join(v.text for v in verses)

    def format_range(self, book: str, start: tuple[int, int], end: tuple[int, int]) -> str:
        """Formats canonical scripture citation range (e.g. '[Genesis 1:1–3]')."""
        book_name = BOOK_NAMES.get(book, book)
        s_ch, s_v = start
        e_ch, e_v = end
        if s_ch == e_ch:
            if s_v == e_v:
                return f"[{book_name} {s_ch}:{s_v}]"
            return f"[{book_name} {s_ch}:{s_v}–{e_v}]"
        return f"[{book_name} {s_ch}:{s_v}–{e_ch}:{e_v}]"

    def format_address(self, passage: Passage) -> str:
        """Formats canonical scripture citation range for a passage."""
        return self.format_range(passage.book, passage.start, passage.end)

    def iter_sections(
        self, passage: Passage
    ) -> list[tuple[str | None, tuple[int, int], tuple[int, int], str]]:
        """Groups passage verses into constituent sections partitioned by headings."""
        verses = self.corpus.get_range(passage.book, passage.start, passage.end)
        if not verses:
            return []
        if not passage.headings:
            return [(None, passage.start, passage.end, " ".join(v.text for v in verses))]

        sorted_headings = sorted(passage.headings, key=lambda h: (h[0], h[1]))
        sections: list[tuple[str | None, tuple[int, int], tuple[int, int], str]] = []

        # Check for unheaded lead-in verses before first heading
        first_h_coord = (sorted_headings[0][0], sorted_headings[0][1])
        lead_verses = [v for v in verses if v.coordinate < first_h_coord]
        if lead_verses:
            sections.append(
                (None, lead_verses[0].coordinate, lead_verses[-1].coordinate, " ".join(v.text for v in lead_verses))
            )

        n_h = len(sorted_headings)
        for i, h in enumerate(sorted_headings):
            h_coord = (h[0], h[1])
            next_h_coord = (sorted_headings[i + 1][0], sorted_headings[i + 1][1]) if i + 1 < n_h else (9999, 9999)
            sec_verses = [v for v in verses if h_coord <= v.coordinate < next_h_coord]
            if sec_verses:
                sections.append(
                    (h[2], sec_verses[0].coordinate, sec_verses[-1].coordinate, " ".join(v.text for v in sec_verses))
                )

        return sections

    @abstractmethod
    def render(self, passage: Passage) -> str: ...


class TextOnlyRenderer(PassageRenderer):
    """Renders raw verse text with no headings or citations."""

    def render(self, passage: Passage) -> str:
        return self.get_text(passage)


class HeadingAndTextRenderer(PassageRenderer):
    """Renders section headings above verse texts, partitioned by section boundaries."""

    def render(self, passage: Passage) -> str:
        sections = self.iter_sections(passage)
        if not sections:
            return ""
        rendered = [
            f"{heading}\n{text}" if heading else text
            for heading, _, _, text in sections
        ]
        return "\n\n".join(rendered)


class BookAndHeadingRenderer(PassageRenderer):
    """Grounds canonical book name above verse texts, partitioned by section boundaries."""

    def render(self, passage: Passage) -> str:
        book_name = BOOK_NAMES.get(passage.book, passage.book)
        sections = self.iter_sections(passage)
        if not sections:
            return ""
        rendered = []
        for heading, _, _, text in sections:
            header = f"{book_name} — {heading}" if heading else book_name
            rendered.append(f"{header}\n{text}")
        return "\n\n".join(rendered)


class AddressAndHeadingRenderer(PassageRenderer):
    """Renders citation address and heading above verse texts, partitioned by section boundaries."""

    def render(self, passage: Passage) -> str:
        sections = self.iter_sections(passage)
        if not sections:
            return ""
        rendered = []
        for heading, start, end, text in sections:
            addr = self.format_range(passage.book, start, end)
            header = f"{addr} {heading}" if heading else addr
            rendered.append(f"{header}\n{text}")
        return "\n\n".join(rendered)


RENDERER_REGISTRY: dict[str, type[PassageRenderer]] = {
    "text_only": TextOnlyRenderer,
    "heading_and_text": HeadingAndTextRenderer,
    "book_and_heading": BookAndHeadingRenderer,
    "address_and_heading": AddressAndHeadingRenderer,
}


def get_renderer(
    strategy: str,
    corpus: BookCorpus,
    **kwargs,
) -> PassageRenderer:
    """Factory resolving a dedicated renderer subclass by strategy name."""
    cls = RENDERER_REGISTRY.get(strategy)
    if not cls:
        raise ValueError(
            f"Unknown render strategy: {strategy}. Expected one of {list(RENDERER_REGISTRY.keys())}"
        )
    return cls(corpus=corpus)
