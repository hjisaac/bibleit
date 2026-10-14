from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class BaseSink(ABC):
    """Abstract destination for pipeline artifacts."""

    @abstractmethod
    def write(self, out_dir: Path, **kwargs: Any) -> Path:
        """Writes or publishes pipeline outputs to destination, returning the output directory."""
        ...
