from abc import ABC, abstractmethod
from typing import Generic, Sequence, TypeVar

from ..types import ScoredChunk

TMeta = TypeVar("TMeta")


class BaseReranker(ABC, Generic[TMeta]):
    """Abstract reranker interface."""

    @abstractmethod
    def rerank(
        self,
        query: str,
        candidates: Sequence[ScoredChunk[TMeta]],
        top_k: int = 10,
    ) -> list[ScoredChunk[TMeta]]:
        ...
