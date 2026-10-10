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


class FastEmbedder(BaseEmbedder):
    """Embedder adapter wrapping fastembed.TextEmbedding."""

    def __init__(
        self,
        model_name: str = "nomic-ai/nomic-embed-text-v1.5",
        cache_dir: Path | str | None = None,
        prefix_query: str = "search_query: ",
        prefix_document: str = "search_document: ",
        **kwargs,
    ):
        self._model_name = str(model_name)
        self._cache_dir = cache_dir
        self.prefix_query = prefix_query
        self.prefix_document = prefix_document
        self._model = TextEmbedding(
            model_name=self._model_name,
            cache_dir=str(cache_dir) if cache_dir else None,
            **kwargs,
        )
        self._dim: int | None = None

    @property
    def model_id(self) -> str:
        return self._model_name

    @property
    def dim(self) -> int:
        if self._dim is None:
            test_vec = next(self._model.embed(["test"]))
            self._dim = int(test_vec.shape[0])
        return self._dim

    @property
    def raw_model(self) -> TextEmbedding:
        return self._model

    def embed_query(self, text: str) -> np.ndarray:
        return next(self._model.embed([self.prefix_query + text]))

    def embed_documents(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        return self._model.embed(
            (f"{self.prefix_document}{t}" for t in texts),
            batch_size=batch_size,
        )

    def embed_queries(
        self, texts: Iterable[str], batch_size: int = 32
    ) -> Iterator[np.ndarray]:
        return self._model.embed(
            (f"{self.prefix_query}{t}" for t in texts),
            batch_size=batch_size,
        )


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
    model: BaseEmbedder | TextEmbedding,
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

        # Baseline fast-path: reuse canonical precomputed embeddings on disk
        if (
            cache_key.endswith("f5_c30_o0_heading_and_text.npy")
            and CHUNK_EMBEDDINGS_NPY_PATH.exists()
        ):
            precomputed = np.load(CHUNK_EMBEDDINGS_NPY_PATH)
            if precomputed.shape[0] == len(chunks):
                logger.info(
                    "Reusing precomputed baseline embeddings from %s",
                    CHUNK_EMBEDDINGS_NPY_PATH.name,
                )
                np.save(cached_file, precomputed)
                return precomputed

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
                embed_documents(model, texts, batch_size=batch_size),
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


FastEmbedEmbedder = FastEmbedder
