from dataclasses import dataclass
from typing import Any, NamedTuple, Sequence

VerseAddress = tuple[str, int, int]  # (book, chapter, verse)
Coordinate = tuple[int, int]  # (chapter, verse)


@dataclass(frozen=True)
class Verse:
    book: str
    start: tuple[int, int]
    text: str

    def __init__(
        self,
        book: str,
        start: tuple[int, int] | Sequence[int] | None = None,
        text: str = "",
        chapter: int | None = None,
        verse: int | None = None,
    ):
        if start is None:
            if chapter is None or verse is None:
                raise ValueError("Verse requires start=(chapter, verse) or both chapter and verse")
            start = (chapter, verse)
        object.__setattr__(self, "book", book)
        object.__setattr__(self, "start", tuple(start))
        object.__setattr__(self, "text", text)

    @property
    def chapter(self) -> int:
        return self.start[0]

    @property
    def verse(self) -> int:
        return self.start[1]

    @property
    def address(self) -> VerseAddress:
        return (self.book, self.start[0], self.start[1])


@dataclass(frozen=True)
class Pericope:
    book: str
    start: tuple[int, int]
    heading: str
    verse_count: int

    def __init__(
        self,
        book: str,
        start: tuple[int, int] | Sequence[int] | None = None,
        heading: str = "",
        verse_count: int = 0,
        chapter: int | None = None,
        verse: int | None = None,
    ):
        if start is None:
            if chapter is None or verse is None:
                raise ValueError("Pericope requires start=(chapter, verse) or both chapter and verse")
            start = (chapter, verse)
        object.__setattr__(self, "book", book)
        object.__setattr__(self, "start", tuple(start))
        object.__setattr__(self, "heading", heading)
        object.__setattr__(self, "verse_count", verse_count)

    @property
    def chapter(self) -> int:
        return self.start[0]

    @property
    def verse(self) -> int:
        return self.start[1]

    @property
    def address(self) -> VerseAddress:
        return (self.book, self.start[0], self.start[1])


@dataclass(frozen=True)
class Passage:
    book: str
    start: tuple[int, int] = (0, 0)
    end: tuple[int, int] = (0, 0)
    start_idx: int = 0
    end_idx: int = 0
    sections: tuple[tuple[int, str | None], ...] = ()
    headings: tuple[str, ...] = ()

    def __init__(
        self,
        book: str,
        start: tuple[int, int] | Sequence[int] | None = None,
        end: tuple[int, int] | Sequence[int] | None = None,
        start_idx: int = 0,
        end_idx: int = 0,
        sections: tuple[tuple[int, str | None], ...] = (),
        headings: tuple[str, ...] = (),
        start_address: VerseAddress | None = None,
        end_address: VerseAddress | None = None,
    ):
        if start is None:
            if start_address is not None:
                start = (start_address[1], start_address[2])
            else:
                start = (0, 0)
        if end is None:
            if end_address is not None:
                end = (end_address[1], end_address[2])
            else:
                end = tuple(start)

        object.__setattr__(self, "book", book)
        object.__setattr__(self, "start", tuple(start))
        object.__setattr__(self, "end", tuple(end))
        object.__setattr__(self, "start_idx", start_idx)
        object.__setattr__(self, "end_idx", end_idx)

        sec_tuple = tuple(sections)
        head_tuple = tuple(headings)
        if not sec_tuple and head_tuple:
            sec_tuple = tuple((start_idx, h) for h in head_tuple)
        elif not head_tuple and sec_tuple:
            head_tuple = tuple(dict.fromkeys(h for _, h in sec_tuple if h))

        object.__setattr__(self, "sections", sec_tuple)
        object.__setattr__(self, "headings", head_tuple)

    @property
    def verse_count(self) -> int:
        return self.end_idx - self.start_idx

    @property
    def chapter(self) -> int:
        return self.start[0]

    @property
    def verse(self) -> int:
        return self.start[1]

    @property
    def start_address(self) -> VerseAddress:
        return (self.book, self.start[0], self.start[1])

    @property
    def end_address(self) -> VerseAddress:
        return (self.book, self.end[0], self.end[1])

    def get_headings_meta(self, ordered_verses: Sequence[tuple[VerseAddress, str]] | None = None) -> list[list[Any]]:
        """Returns [[chapter, verse, heading], ...] for genuine topical section headings."""
        meta: list[list[Any]] = []
        seen = set()
        for sec_idx, sec_heading in self.sections:
            if not sec_heading or sec_heading == self.book:
                continue
            addr = ordered_verses[sec_idx][0] if (ordered_verses and sec_idx < len(ordered_verses)) else None
            ch = addr[1] if addr else self.start[0]
            v = addr[2] if addr else self.start[1]
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
