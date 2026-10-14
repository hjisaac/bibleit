from abc import ABC, abstractmethod
from typing import Generic, Iterator, TypeVar

TOutput = TypeVar("TOutput")


class BaseWalker(ABC, Generic[TOutput]):
    """Generic contract: walks a data source lazily or materializes to a list."""

    @abstractmethod
    def lazy_walk(self) -> Iterator[TOutput]:
        """Streams items lazily one by one."""
        ...

    def walk(self) -> list[TOutput]:
        """Eagerly materializes all walked items into a list."""
        return list(self.lazy_walk())
