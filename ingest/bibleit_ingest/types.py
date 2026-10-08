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


@dataclass(frozen=True)
class VerseEvent:
    address: VerseAddress
    heading: str | None = None


class PreparedCorpus(NamedTuple):
    pericopes: list[Pericope]
    ordered_verses: list[tuple[VerseAddress, str]]
    address_index: dict[VerseAddress, int]
