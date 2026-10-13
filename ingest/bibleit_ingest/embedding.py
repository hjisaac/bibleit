from pathlib import Path
from typing import Iterable, Iterator

import numpy as np
from fastembed import TextEmbedding

from rag_core.embedders import BaseEmbedder


class Embedder(TextEmbedding, BaseEmbedder):
    """FastEmbed TextEmbedding subclass implementing BaseEmbedder."""

    def __init__(
        self,
        model_name: str = "nomic-ai/nomic-embed-text-v1.5",
        cache_dir: Path | str | None = None,
        prefix_query: str = "search_query: ",
        prefix_document: str = "search_document: ",
        **kwargs,
    ):
        super().__init__(
            model_name=str(model_name),
            cache_dir=str(cache_dir) if cache_dir else None,
            **kwargs,
        )
        self.prefix_query = prefix_query
        self.prefix_document = prefix_document

    @property
    def dim(self) -> int:
        return self.embedding_size

    def embed_query(self, text: str) -> np.ndarray:
        return next(self.embed([f"{self.prefix_query}{text}"]))

    def embed_documents(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        return self.embed(
            (f"{self.prefix_document}{t}" for t in texts),
            batch_size=batch_size,
        )

    def embed_queries(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        return self.embed(
            (f"{self.prefix_query}{t}" for t in texts),
            batch_size=batch_size,
        )
