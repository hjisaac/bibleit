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
    model: TextEmbedding, texts: Iterable[str], batch_size: int = 1
) -> Iterator[np.ndarray]:
    """Embeds document/chunk texts with the "search_document:" prefix.
    Lazy: yields one at a time instead of collecting into a list, so a
    caller can write each embedding to disk as it arrives.

    batch_size defaults to 1, not fastembed's 256: dynamic padding means
    one long chunk in a batch inflates every member's memory to match --
    real OOM risk given the Bible's chunk lengths (a handful run 3,000+
    tokens, see Psalm 119). Batch of 1 bounds memory to one chunk."""
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
            "chapter": c.pericopes[0].chapter,
            "verse": c.pericopes[0].verse,
            "headings": c.headings,
            "verse_count": c.verse_count,
        }
        for c in chunks
    ]
    json_path = out_dir / "chunks.json"
    json_path.write_text(json.dumps(meta, indent=2))
    return npy_path, json_path
