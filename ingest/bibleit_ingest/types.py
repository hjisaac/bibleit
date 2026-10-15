from dataclasses import dataclass
from typing import Any, NamedTuple, Sequence

VerseAddress = tuple[str, int, int]  # (book, chapter, verse)


@dataclass(frozen=True)
class Pericope:
    book: str
    chapter: int
    verse: int
    heading: str
    verse_count: int

    @property
    def start(self) -> list[int]:
        return [self.chapter, self.verse]


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

    @property
    def start(self) -> list[int]:
        return [self.chapter, self.verse]

    @property
    def end(self) -> list[int]:
        if self.end_address:
            return [self.end_address[1], self.end_address[2]]
        return [self.chapter, self.verse]

    def get_headings_meta(self, ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None) -> list[list[Any]]:
        """Returns [[chapter, verse, heading], ...] for genuine topical section headings."""
        meta: list[list[Any]] = []
        seen = set()
        for sec_idx, sec_heading in self.sections:
            if not sec_heading or sec_heading == self.book:
                continue
            addr = ordered_verses[sec_idx][0] if (ordered_verses and sec_idx < len(ordered_verses)) else None
            ch = addr[1] if addr else self.chapter
            v = addr[2] if addr else self.verse
            key = (ch, v, sec_heading)
            if key not in seen:
                seen.add(key)
                meta.append([ch, v, sec_heading])
        return meta


Chunk = Passage


@dataclass(frozen=True)
class VerseEvent:
    address: VerseAddress
    heading: str | None = None


class PreparedCorpus(NamedTuple):
    pericopes: list[Pericope]
    ordered_verses: list[tuple[VerseAddress, str]]
    address_index: dict[VerseAddress, int]
