import json
import logging
import sys

import numpy as np
from codetiming import Timer
from fastembed import TextEmbedding
from tqdm import tqdm

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
    render_chunk_text,
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
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes

# stdout, not logging's stderr default, to stay off tqdm's stream below.
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout
)
logger = logging.getLogger(__name__)


def main():
    ordered_verses = load_web_verses(WEB_PATH)
    address_index = index_verses_by_address(ordered_verses)
    web_addresses_by_book = group_verse_addresses_by_book(ordered_verses)

    bsb_native = derive_bsb_pericopes(BSB_DIR)
    resolved, unresolved = project_pericopes(bsb_native, web_addresses_by_book)

    chunker = FloorCeilingMergeChunker()
    chunks = chunker.chunk_bible(resolved)
    logger.info("chunking the whole Bible: %d chunks", len(chunks))
    if unresolved:
        logger.info("%d pericope(s) had no valid WEB start address, skipped:", len(unresolved))
        for p in unresolved:
            logger.info('  %s %d:%d  "%s"', p.book, p.chapter, p.verse, p.heading)

    with Timer(
        text=f"loaded {EmbeddingModel.NOMIC_EMBED_TEXT_V1_5} in {{:.1f}}s", logger=logger.info
    ):
        model = TextEmbedding(
            model_name=EmbeddingModel.NOMIC_EMBED_TEXT_V1_5,
            cache_dir=str(FASTEMBED_CACHE_DIR),
        )

    # Generator, not a list: text isn't rendered until the embedder asks.
    texts = (render_chunk_text(c, ordered_verses, address_index) for c in chunks)
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
