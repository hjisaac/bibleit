from typing import Iterable, Iterator

import numpy as np
from fastembed import TextEmbedding


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
