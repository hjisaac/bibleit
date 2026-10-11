import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Iterator, Sequence

import numpy as np
from codetiming import Timer
from fastembed import TextEmbedding
from tqdm import tqdm

from rag_core.embedders import BaseEmbedder
from .constants import CHUNK_EMBEDDINGS_NPY_PATH
from .renderers import get_renderer
from .types import Passage, VerseAddress

if TYPE_CHECKING:
    from .chunking import Chunk

logger = logging.getLogger(__name__)


class FastEmbedder(TextEmbedding, BaseEmbedder):
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


Embedder = FastEmbedder


def embed_query(model: BaseEmbedder | TextEmbedding, text: str) -> np.ndarray:
    """Embeds one query with the search_query prefix."""
    if isinstance(model, BaseEmbedder):
        return model.embed_query(text)
    return next(model.embed(["search_query: " + text]))


def embed_documents(
    model: BaseEmbedder | TextEmbedding, texts: Iterable[str], batch_size: int = 32
) -> Iterator[np.ndarray]:
    """Embeds document/chunk texts lazily."""
    if isinstance(model, BaseEmbedder):
        return model.embed_documents(texts, batch_size=batch_size)
    return model.embed(
        (f"search_document: {t}" for t in texts), batch_size=batch_size
    )


def save_chunk_embeddings(
    chunks: Sequence["Chunk"],
    texts: Iterable[str],
    model: BaseEmbedder | TextEmbedding,
    out_dir: Path,
) -> tuple[Path, Path]:
    """Computes and writes chunk embeddings matrix and metadata to out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    matrix = np.array(list(embed_documents(model, texts)))
    npy_path = out_dir / "embeddings.npy"
    np.save(npy_path, matrix)

    meta = [
        {
            "book": c.book,
            "chapter": c.chapter,
            "verse": c.verse,
            "headings": list(c.headings),
            "verse_count": c.verse_count,
        }
        for c in chunks
    ]
    json_path = out_dir / "chunks.json"
    json_path.write_text(json.dumps(meta, indent=2))
    return npy_path, json_path


def get_or_create_chunk_embeddings(
    chunks: Sequence[Passage],
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    embedder: BaseEmbedder | TextEmbedding,
    render_strategy: str = "heading_and_text",
    cache_dir: Path | None = None,
    cache_key: str | None = None,
    batch_size: int = 16,
) -> np.ndarray:
    """Returns cached chunk embedding matrix or computes, caches, and returns it."""
    if cache_dir and cache_key:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached_file = cache_dir / cache_key
        if cached_file.exists():
            logger.info("Found cached corpus embeddings at %s", cached_file.name)
            return np.load(cached_file)

    renderer = get_renderer(render_strategy, ordered_verses=ordered_verses)
    texts = (renderer.render(c) for c in chunks)
    total = len(chunks)
    logger.info(
        "Embedding %d chunks with strategy '%s' (batch_size=%d)...",
        total,
        render_strategy,
        batch_size,
    )

    with Timer(text=f"Embedded {total} chunks in {{:.1f}}s", logger=logger.info):
        vectors = list(
            tqdm(
                embed_documents(embedder, texts, batch_size=batch_size),
                total=total,
                desc=f"embedding chunks [{render_strategy}]",
                unit="chunk",
            )
        )

    matrix = np.array(vectors)
    if cache_dir and cache_key:
        np.save(cache_dir / cache_key, matrix)
        logger.info("Saved cached embeddings to %s", cached_file.name)
    return matrix
