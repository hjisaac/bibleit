import json
import logging
import sys

import numpy as np
from codetiming import Timer
from fastembed import TextEmbedding
from tqdm import tqdm

from bibleit_ingest.chunking import (
    AdaptiveWindowChunker,
    ChunkRenderer,
)
from bibleit_ingest.constants import (
    BSB_DIR,
    CHUNK_EMBEDDINGS_NPY_PATH,
    CHUNK_EMBEDDINGS_PATH,
    FASTEMBED_CACHE_DIR,
    WEB_PATH,
    EmbeddingModel,
)
from bibleit_ingest.embedding import embed_documents
from bibleit_ingest.pericopes import get_or_prepare_corpus

# stdout, not logging's stderr default, to stay off tqdm's stream below.
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout
)
logger = logging.getLogger(__name__)


def main():
    corpus = get_or_prepare_corpus(WEB_PATH, BSB_DIR)
    chunker = AdaptiveWindowChunker(
        ordered_verses=corpus.ordered_verses,
        address_index=corpus.address_index,
    )
    chunks = chunker.chunk(corpus.pericopes)
    logger.info("chunking the whole Bible: %d chunks", len(chunks))

    with Timer(
        text=f"loaded {EmbeddingModel.NOMIC_EMBED_TEXT_V1_5} in {{:.1f}}s", logger=logger.info
    ):
        model = TextEmbedding(
            model_name=EmbeddingModel.NOMIC_EMBED_TEXT_V1_5,
            cache_dir=str(FASTEMBED_CACHE_DIR),
        )

    # Generator, not a list: text isn't rendered until the embedder asks.
    renderer = ChunkRenderer(corpus.ordered_verses, corpus.address_index)
    texts = (renderer.render(c) for c in chunks)
    embeddings = embed_documents(model, texts)

    metadata = []
    embeddings_npy = None
    progress = tqdm(
        zip(chunks, embeddings),
        total=len(chunks),
        desc="embedding chunks",
        unit="chunk",
    )
    with Timer(text=f"embedded {len(chunks)} chunks in {{:.2f}}s", logger=logger.info):
        for i, (chunk, embedding) in enumerate(progress):
            if embeddings_npy is None:
                embeddings_npy = np.lib.format.open_memmap(
                    CHUNK_EMBEDDINGS_NPY_PATH,
                    mode="w+",
                    dtype=embedding.dtype,
                    shape=(len(chunks), embedding.shape[0]),
                )
            embeddings_npy[i] = embedding
            metadata.append(
                {
                    "book": chunk.book,
                    "chapter": chunk.pericopes[0].chapter,
                    "verse": chunk.pericopes[0].verse,
                    "headings": chunk.headings,
                    "verse_count": chunk.verse_count,
                }
            )
    embeddings_npy.flush()

    CHUNK_EMBEDDINGS_PATH.write_text(
        json.dumps(
            {"model": EmbeddingModel.NOMIC_EMBED_TEXT_V1_5, "chunks": metadata},
            indent=2,
        )
    )
    logger.info(
        "saved %d chunk embeddings to %s and %s",
        len(chunks),
        CHUNK_EMBEDDINGS_PATH,
        CHUNK_EMBEDDINGS_NPY_PATH,
    )


if __name__ == "__main__":
    main()
