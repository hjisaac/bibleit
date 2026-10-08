from abc import ABC, abstractmethod
from typing import Generic, TypeVar

TItem = TypeVar("TItem")


class BaseChunkRenderer(ABC, Generic[TItem]):
    """Abstract chunk renderer transforming a raw unit into an embedding text."""

    @abstractmethod
    def render(self, item: TItem) -> str:
        """Renders item to embedding text representation."""
        ...
