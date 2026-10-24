from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Iterable, Literal, Sequence

from .constants import ARTIFACT_DIGEST_BYTES

Coordinate = tuple[int, int]  # (chapter, verse)
VerseAddress = tuple[str, int, int]  # (book, chapter, verse)


@dataclass(frozen=True, slots=True)
class Verse:
    book: str
    chapter: int
    verse: int
    text: str

    @property
    def coordinate(self) -> Coordinate:
        return (self.chapter, self.verse)

    @property
    def address(self) -> VerseAddress:
        return (self.book, self.chapter, self.verse)


@dataclass(frozen=True, slots=True)
class Pericope:
    book: str
    start: Coordinate
    heading: str

    @property
    def chapter(self) -> int:
        return self.start[0]

    @property
    def verse(self) -> int:
        return self.start[1]

    @property
    def address(self) -> VerseAddress:
        return (self.book, self.start[0], self.start[1])


@dataclass(frozen=True, slots=True)
class Passage:
    book: str
    start: Coordinate
    end: Coordinate
    headings: tuple[tuple[int, int, str], ...] = ()

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

    def __contains__(self, item: Coordinate | Verse | VerseAddress) -> bool:
        """Determines if a verse or coordinate falls within this passage span."""
        if isinstance(item, Verse):
            return item.book == self.book and self.start <= item.coordinate <= self.end
        if isinstance(item, tuple):
            if len(item) == 2:
                return self.start <= item <= self.end
            if len(item) == 3:
                return item[0] == self.book and self.start <= (item[1], item[2]) <= self.end
        return False

    @classmethod
    def from_verses(
        cls,
        verses: Sequence[Verse],
        headings: Sequence[tuple[int, int, str]] = (),
    ) -> "Passage":
        if not verses:
            raise ValueError("Passage cannot be empty")
        first, last = verses[0], verses[-1]
        if first.book != last.book:
            raise ValueError(f"Passage cannot cross books: {first.book} != {last.book}")
        return cls(
            book=first.book,
            start=first.coordinate,
            end=last.coordinate,
            headings=tuple(headings),
        )


Chunk = Passage
RenderStrategy = Literal[
    "text_only",
    "heading_and_text",
    "book_and_heading",
    "address_and_heading",
]

_RENDER_STRATEGY_SHORT: dict[str, str] = {
    "text_only": "text",
    "heading_and_text": "heading",
    "book_and_heading": "book_heading",
    "address_and_heading": "addr_heading",
}


@dataclass(frozen=True, slots=True)
class ChunkConfig:
    strategy: Literal["adaptive", "token_window", "pericope"] = "adaptive"
    ceiling: int = 30
    overlap: int = 0
    floor: int = 5
    headroom_margin: int = 25
    render_strategy: RenderStrategy = "heading_and_text"
    include_overlap_heading: bool = True
    tokenizer: str | None = None

    @property
    def canonical_dict(self) -> dict[str, Any]:
        """Dictionary of active parameters, omitting None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}

    @property
    def content_hash(self) -> str:
        """Deterministic 12-char BLAKE2b hex digest of canonical parameters."""
        payload = json.dumps(self.canonical_dict, sort_keys=True).encode("utf-8")
        return hashlib.blake2b(payload, digest_size=ARTIFACT_DIGEST_BYTES).hexdigest()

    @property
    def _short_slug(self) -> str:
        strat = _RENDER_STRATEGY_SHORT.get(self.render_strategy, self.render_strategy[:8])
        ovh = f"_ovh{int(self.include_overlap_heading)}" if self.overlap > 0 else ""
        if self.strategy == "pericope":
            return f"peri_c{self.ceiling}_o{self.overlap}{ovh}_{strat}"
        if self.strategy == "token_window":
            return f"tok_c{self.ceiling}_o{self.overlap}{ovh}_{strat}"
        return f"f{self.floor}_c{self.ceiling}_o{self.overlap}{ovh}_{strat}"

    @property
    def slug(self) -> str:
        """Content-addressed slug: 12-char hash followed by the readable descriptor."""
        return f"{self.content_hash}_{self._short_slug}"


class BookCorpus:
    """In-memory book-by-book scripture store supporting O(1) coordinate lookups."""

    def __init__(self, books: dict[str, list[Verse]] | dict[str, dict[int, dict[int, str]]]):
        if books and isinstance(next(iter(books.values())), dict):
            # Dict of chapters {ch: {v: text}}
            converted: dict[str, list[Verse]] = {}
            for b_id, ch_map in books.items():  # type: ignore
                v_list = []
                for ch, v_map in ch_map.items():
                    for v_num, txt in v_map.items():
                        v_list.append(Verse(book=b_id, chapter=ch, verse=v_num, text=txt))
                converted[b_id] = sorted(v_list, key=lambda x: x.coordinate)
            self._books = converted
        else:
            self._books = books  # type: ignore

        self._index: dict[str, dict[int, dict[int, Verse]]] = {}
        for book_id, verses in self._books.items():
            b_dict: dict[int, dict[int, Verse]] = {}
            for v in verses:
                b_dict.setdefault(v.chapter, {})[v.verse] = v
            self._index[book_id] = b_dict

    @classmethod
    def from_verses(cls, verses: Iterable[Verse]) -> "BookCorpus":
        """Builds a BookCorpus directly from an iterable stream of Verses."""
        books: dict[str, list[Verse]] = {}
        for v in verses:
            books.setdefault(v.book, []).append(v)
        return cls(books)

    def get_verse(self, book: str, chapter: int, verse: int) -> Verse | None:
        return self._index.get(book, {}).get(chapter, {}).get(verse)

    def get_book(self, book: str) -> list[Verse]:
        return self._books.get(book, [])

    def __contains__(self, item: VerseAddress | tuple[str, int, int]) -> bool:
        if isinstance(item, tuple) and len(item) == 3:
            return bool(self.get_verse(item[0], item[1], item[2]))
        return False

    def get_range(self, book: str, start: Coordinate, end: Coordinate) -> list[Verse]:
        book_verses = self._books.get(book, [])
        return [v for v in book_verses if start <= v.coordinate <= end]

    @property
    def books(self) -> dict[str, list[Verse]]:
        return self._books

    def all_verses(self) -> list[Verse]:
        return [v for b_verses in self._books.values() for v in b_verses]

    def to_dict(self) -> dict[str, list[list[str]]]:
        """Serializes corpus to { [book]: string[][] } with sparse verse alignment."""
        payload: dict[str, list[list[str]]] = {}
        for book, ch_map in self._index.items():
            max_ch = max(ch_map.keys()) if ch_map else 0
            book_arr: list[list[str]] = []
            for ch in range(1, max_ch + 1):
                verses_in_ch = ch_map.get(ch, {})
                max_v = max(verses_in_ch.keys()) if verses_in_ch else 0
                ch_arr: list[str] = [
                    verses_in_ch[v].text if v in verses_in_ch else ""
                    for v in range(1, max_v + 1)
                ]
                book_arr.append(ch_arr)
            payload[book] = book_arr
        return payload
