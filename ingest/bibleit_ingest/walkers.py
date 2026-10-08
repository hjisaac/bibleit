import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Iterator

from rag_core.walkers import BaseWalker
from .constants import USFM_ORDER
from .types import VerseAddress, VerseEvent


class WebCorpusWalker(BaseWalker[tuple[VerseAddress, str]]):
    """Streams verses lazily from a World English Bible JSON export."""

    def __init__(self, path: Path):
        self.path = path

    def walk(self) -> Iterator[tuple[VerseAddress, str]]:
        doc = json.loads(self.path.read_text())
        for b in doc.get("books", []):
            code = USFM_ORDER[int(b["nr"]) - 1]
            for ch in b.get("chapters", []):
                chapter = int(ch["chapter"])
                for v in ch.get("verses", []):
                    yield ((code, chapter, int(v["verse"])), v["text"])


class BsbBookWalker(BaseWalker[VerseEvent]):
    """Walks one BSB USJ book AST, yielding VerseEvent instances."""

    def __init__(self, path: Path | None = None):
        self.path = path
        self._book = ""
        self._ch: int | None = None
        self._pending_heading: str | None = None

    def walk(self, path: Path | None = None) -> Iterator[VerseEvent]:
        target = path or self.path
        if target is None:
            raise ValueError("No path provided to BsbBookWalker")
        self._book = target.stem
        self._ch = None
        self._pending_heading = None

        doc = json.loads(target.read_text())
        yield from self._visit(doc.get("content", []))

    def _visit(self, node: Any) -> Iterator[VerseEvent]:
        if isinstance(node, list):
            for child in node:
                yield from self._visit(child)
            return
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        if node_type == "chapter":
            self._ch = int(node["number"])
        elif node.get("marker") == "s1":
            self._pending_heading = "".join(
                c for c in node.get("content", []) if isinstance(c, str)
            ).strip()
        elif node_type == "verse":
            n = str(node["number"]).split("-")[-1].split(",")[-1]
            addr = (self._book, self._ch, int(n))  # type: ignore[arg-type]
            heading, self._pending_heading = self._pending_heading, None
            yield VerseEvent(address=addr, heading=heading)
        for child in node.get("content", []):
            yield from self._visit(child)

    def visit(self, node: Any) -> Iterator[VerseEvent]:
        """Backwards compatibility alias for _visit."""
        return self._visit(node)


class BsbCorpusWalker(BaseWalker[VerseEvent]):
    """Walks an entire BSB translation directory in canonical USFM order."""

    def __init__(self, bsb_dir: Path):
        self.bsb_dir = bsb_dir
        self._book_walker = BsbBookWalker()

    def walk(self) -> Iterator[VerseEvent]:
        for code in USFM_ORDER:
            book_path = self.bsb_dir / f"{code}.usj"
            if book_path.exists():
                yield from self._book_walker.walk(book_path)


class BookWalker(ABC):
    """Abstract base for single book walkers (backwards compatibility)."""

    @abstractmethod
    def walk(self, path: Path) -> Iterator[VerseEvent]: ...


BSBBookWalker = BsbBookWalker
