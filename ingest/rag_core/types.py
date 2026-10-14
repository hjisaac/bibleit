from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

TMeta = TypeVar("TMeta")


@dataclass(frozen=True)
class GenericChunk(Generic[TMeta]):
    """Atomic retrieval unit with an identifier, searchable text, and domain metadata."""

    id: int | str
    text: str
    metadata: TMeta


@dataclass(frozen=True)
class ScoredChunk(Generic[TMeta]):
    """Chunk associated with a retrieval score and source attribution."""

    chunk: GenericChunk[TMeta]
    score: float
    source: str = "semantic"
