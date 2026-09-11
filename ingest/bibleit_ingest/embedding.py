"""
Small helpers for calling the embedding model consistently. Nomic Embed
requires different prefixes for text being indexed versus text being
queried; centralizing that here means every script uses the same
convention instead of each one repeating the prefix string by hand.
"""

from typing import Iterable, Iterator

import numpy as np
from fastembed import TextEmbedding


def embed_query(model: TextEmbedding, text: str) -> np.ndarray:
    """
    Embeds one query string with the "search_query:" prefix Nomic Embed
    expects for a query, as opposed to text being indexed.
    """
    return next(model.embed(["search_query: " + text]))


def embed_documents(
    model: TextEmbedding, texts: Iterable[str], batch_size: int = 1
) -> Iterator[np.ndarray]:
    """
    Embeds document or chunk texts with the "search_document:" prefix
    Nomic Embed expects for text being indexed, as opposed to a query.

    Lazy: fastembed's own `model.embed()` already batches inference
    internally and yields one result at a time, so this just passes that
    laziness through instead of collecting it into a list. That lets a
    caller write each embedding to disk as it arrives, rather than
    holding every embedding for the whole input in memory at once.

    `batch_size` defaults to 1, not fastembed's own default of 256.
    Padding within a batch is dynamic, sized to that batch's own longest
    sequence, so one long chunk grouped with several short ones forces
    every member of that batch to pad up to the long one, multiplying
    memory by the batch size. The Bible's chunk lengths are uneven enough
    (most chunks are a few hundred tokens, a handful are 3,000+, see
    Psalm 119) that this isn't a hypothetical: batching them together is
    what caused an out-of-memory kill in practice. Embedding one chunk at
    a time is slower, but bounds memory to that one chunk's own length,
    never inflated by whatever happens to land in the same batch.
    """
    return model.embed(
        (f"search_document: {t}" for t in texts), batch_size=batch_size
    )
