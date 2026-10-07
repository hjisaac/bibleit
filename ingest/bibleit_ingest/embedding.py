import json
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Iterator, Sequence

import numpy as np
from fastembed import TextEmbedding

from .chunking import ChunkRenderer, Passage, VerseAddress
from .constants import CHUNK_EMBEDDINGS_NPY_PATH

if TYPE_CHECKING:
    from .chunking import Chunk


def embed_query(model: TextEmbedding, text: str) -> np.ndarray:
    """Embeds one query with the "search_query:" prefix Nomic Embed
    expects, as opposed to indexed text."""
    return next(model.embed(["search_query: " + text]))


def embed_documents(
    model: TextEmbedding, texts: Iterable[str], batch_size: int = 32
) -> Iterator[np.ndarray]:
    """Embeds document/chunk texts with the "search_document:" prefix.
    Lazy: yields one at a time with batch_size=32 for vector execution."""
    return model.embed(
        (f"search_document: {t}" for t in texts), batch_size=batch_size
    )


def save_chunk_embeddings(
    chunks: Sequence["Chunk"],
    texts: Iterable[str],
    model: TextEmbedding,
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


import logging

logger = logging.getLogger(__name__)


def get_or_create_chunk_embeddings(
    chunks: Sequence[Passage],
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    model: TextEmbedding,
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
                logger.info("Reusing precomputed baseline embeddings from %s", CHUNK_EMBEDDINGS_NPY_PATH.name)
                np.save(cached_file, precomputed)
                return precomputed

    renderer = ChunkRenderer(ordered_verses=ordered_verses, strategy=render_strategy)
    texts = [renderer.render(c) for c in chunks]
    total = len(texts)
    logger.info("Embedding %d chunks with strategy '%s' (batch_size=%d)...", total, render_strategy, batch_size)

    vectors: list[np.ndarray] = []
    for i, vec in enumerate(embed_documents(model, texts, batch_size=batch_size)):
        vectors.append(vec)
        if (i + 1) % 50 == 0 or (i + 1) == total:
            logger.info("  Embedded %d/%d chunks (%.1f%%)", i + 1, total, (i + 1) / total * 100)

    matrix = np.array(vectors)
    if cache_dir and cache_key:
        np.save(cache_dir / cache_key, matrix)
        logger.info("Saved cached embeddings to %s", cached_file.name)
    return matrix
