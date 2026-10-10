from abc import ABC, abstractmethod
from typing import Iterable, Iterator, Sequence

import numpy as np


class BaseEmbedder(ABC):
    """Abstract contract for text embedding models."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Identifier of the underlying model (e.g. 'nomic-ai/nomic-embed-text-v1.5')."""
        ...

    @property
    @abstractmethod
    def dim(self) -> int:
        """Embedding dimension (e.g. 768, 384)."""
        ...

    @abstractmethod
    def embed_documents(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        """Streams embeddings for a collection of documents/chunks."""
        ...

    @abstractmethod
    def embed_query(self, text: str) -> np.ndarray:
        """Embeds a single search query."""
        ...

    def embed_queries(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        """Streams embeddings for a collection of search queries."""
        return (self.embed_query(t) for t in texts)

    def embed(self, texts: Sequence[str], batch_size: int = 32) -> np.ndarray:
        """Eagerly embeds a sequence of texts into a (N, dim) matrix."""
        return np.array(list(self.embed_documents(texts, batch_size=batch_size)))
