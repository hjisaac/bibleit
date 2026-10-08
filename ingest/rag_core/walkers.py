from abc import ABC, abstractmethod
from typing import Generic, Iterator, TypeVar

TOutput = TypeVar("TOutput")


class BaseWalker(ABC, Generic[TOutput]):
    """Generic contract: walks a data source and streams items lazily."""

    @abstractmethod
    def walk(self) -> Iterator[TOutput]:
        """Public entry point: streams items one by one."""
        ...
