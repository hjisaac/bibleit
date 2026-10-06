import json
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Iterator, Sequence

import numpy as np
from fastembed import TextEmbedding

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
