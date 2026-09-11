"""
Runs ingest/eval/data/question_to_passage.json against the currently
embedded chunks (see embed_chunks.py) and reports recall@k and MRR.

Every run's results and log are saved under
ingest/eval/results/question_to_passage_eval/, timestamped together, so
results from different chunking/model settings can be compared later
instead of each run overwriting the last. Each result also records the
exact conditions that produced it (input files, k, models), so a saved
result is self-describing months later, not just a number with no context.

Run from ingest/:
    .venv/bin/python eval/question_to_passage_eval.py
"""
import json
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

import numpy as np
from box import Box
from codetiming import Timer
from fastembed import TextEmbedding

from bibleit_ingest.chunking import (
    FloorCeilingMergeChunker,
    group_verse_addresses_by_book,
    index_verses_by_address,
    load_web_verses,
)
from bibleit_ingest.constants import (
    BSB_DIR,
    CHUNK_EMBEDDINGS_NPY_PATH,
    CHUNK_EMBEDDINGS_PATH,
    FASTEMBED_CACHE_DIR,
    REPO,
    WEB_PATH,
    EmbeddingModel,
)
from bibleit_ingest.embedding import embed_query
from bibleit_ingest.logging_utils import setup_logger
from bibleit_ingest.pericopes import derive_bsb_pericopes, project_pericopes
from eval.helpers import trigger_eval

frozen_box_cls = partial(Box, frozen_box=True)

# Derived from this file's own name instead of hardcoded, so a renamed
# eval script automatically gets a matching results folder. Nothing to
# keep in sync by hand.
RESULTS_DIR = REPO / "ingest/eval/results" / Path(__file__).stem

EVAL_DATA_PATH = REPO / "ingest/eval/data/question_to_passage.json"
K = 1


@Timer(name=Path(__file__).stem, text="Eval run completed in {:.2f} seconds")
def main():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    logger = setup_logger(__name__, RESULTS_DIR / f"{timestamp}.log")

    cached = json.loads(CHUNK_EMBEDDINGS_PATH.read_text())

    run_conditions = frozen_box_cls(
        frozen_box=True,
        chunk_embeddings_path=CHUNK_EMBEDDINGS_PATH,
        chunk_embeddings_npy_path=CHUNK_EMBEDDINGS_NPY_PATH,
        web_path=WEB_PATH,
        eval_data_path=EVAL_DATA_PATH,
        k=K,
        embedding_model=str(EmbeddingModel.NOMIC_EMBED_TEXT_V1_5),
        chunk_source_model=cached["model"],
    )
    logger.info(
        "Using run conditions:\n%s",
        run_conditions.to_json(indent=2, default=str),
    )

    # Recomputed fresh rather than reconstructed from chunk_embeddings.json:
    # the cached metadata only keeps an aggregate `headings` list and one
    # total `verse_count` per chunk, with no record of where each
    # individual pericope's own span starts within a merge. Building one
    # Pericope per chunk from that (as this used to do) silently dropped
    # every heading after the first. Chunking is a pure function of the
    # BSB/WEB source data and the floor/ceiling parameters, none of which
    # change between runs, so recomputing it here reproduces the exact
    # same chunks embed_chunks.py produced, with every pericope intact.
    ordered_verses = load_web_verses(WEB_PATH)
    address_index = index_verses_by_address(ordered_verses)
    web_addresses_by_book = group_verse_addresses_by_book(ordered_verses)
    bsb_native = derive_bsb_pericopes(BSB_DIR)
    resolved, _ = project_pericopes(bsb_native, web_addresses_by_book)
    chunker = FloorCeilingMergeChunker()
    chunks = chunker.chunk_bible(resolved)

    # Row-aligned with `chunks` above: row i is chunk i's embedding.
    # Loaded fully into memory here (not memory-mapped), since building
    # the usearch index below needs every vector anyway.
    chunk_embeddings = np.load(CHUNK_EMBEDDINGS_NPY_PATH)
    assert len(chunks) == chunk_embeddings.shape[0], (
        f"recomputed {len(chunks)} chunks but {CHUNK_EMBEDDINGS_NPY_PATH} has "
        f"{chunk_embeddings.shape[0]} rows - embeddings are stale, rerun embed_chunks.py"
    )
    logger.info("Loaded %d embedded chunks", len(chunks))

    model = TextEmbedding(
        model_name=EmbeddingModel.NOMIC_EMBED_TEXT_V1_5,
        cache_dir=str(FASTEMBED_CACHE_DIR),
    )

    eval_results = trigger_eval(
        EVAL_DATA_PATH,
        chunks,
        chunk_embeddings,
        address_index,
        partial(embed_query, model),
        k=K,
    )
    logger.info("Metrics:\n%s", json.dumps(eval_results["metrics"], indent=2))

    results = {"run_conditions": run_conditions.to_dict(), **eval_results}
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS_DIR / f"{timestamp}.json"
    out_path.write_text(json.dumps(results, indent=2, default=str))
    logger.info("Saved to %s", out_path)


if __name__ == "__main__":
    main()
