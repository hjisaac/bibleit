from dataclasses import dataclass
from typing import NamedTuple

VerseAddress = tuple[str, int, int]  # (book, chapter, verse)


@dataclass(frozen=True)
class Pericope:
    book: str
    chapter: int
    verse: int
    heading: str
    verse_count: int


@dataclass(frozen=True)
class Passage:
    book: str
    start_idx: int
    end_idx: int
    sections: tuple[tuple[int, str | None], ...] = ()
    headings: tuple[str, ...] = ()
    start_address: VerseAddress | None = None
    end_address: VerseAddress | None = None

    def __post_init__(self):
        if not self.sections and self.headings:
            object.__setattr__(self, "sections", tuple((self.start_idx, h) for h in self.headings))
        elif not self.headings and self.sections:
            object.__setattr__(self, "headings", tuple(dict.fromkeys(h for _, h in self.sections if h)))

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


@dataclass(frozen=True)
class VerseEvent:
    address: VerseAddress
    heading: str | None = None


class PreparedCorpus(NamedTuple):
    pericopes: list[Pericope]
    ordered_verses: list[tuple[VerseAddress, str]]
    address_index: dict[VerseAddress, int]
