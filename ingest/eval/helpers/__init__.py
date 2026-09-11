"""
Retrieval-only evaluation: for each (question, relevant verse) pair in a
question_to_passage.json-shaped eval set, embed the question, search the
currently embedded chunks via usearch, and score with ranx.

No generation is involved anywhere here. This measures retrieval quality
only, the same scope as ingest/eval/data/question_to_passage.json.
"""

import json
from pathlib import Path
from typing import Sequence

import numpy as np
from ranx import Qrels, Run, evaluate
from usearch.index import Index

from bibleit_ingest.chunking import Chunk, VerseAddress, resolve_verse_to_chunk_index


def trigger_eval(
    eval_path: Path,
    chunks: Sequence[Chunk],
    chunk_embeddings: np.ndarray,  # (n_chunks, dim), same order as `chunks`
    address_index: dict[VerseAddress, int],
    embed_query_fn,  # str -> np.ndarray(dim,); caller supplies the model call
    k: int = 10,
) -> dict:
    """
    Runs every query in the eval set through real retrieval (usearch) and
    scores it (ranx). Returns {"metrics": {...}, "unresolvable": [...]}.
    """
    eval_data = json.loads(eval_path.read_text())

    index = Index(ndim=chunk_embeddings.shape[1], metric="cos")
    index.add(np.arange(len(chunks)), chunk_embeddings.astype(np.float32))

    qrels_dict: dict[str, dict[str, int]] = {}
    run_dict: dict[str, dict[str, float]] = {}
    unresolvable = []

    for q in eval_data["queries"]:
        # This only handles single-relevant-verse queries for now. The
        # ground truth format supports more; this eval doesn't yet.
        rel = q["relevant"][0]
        address = (rel["book"], rel["chapter"], rel["verse"])
        relevant_idx = resolve_verse_to_chunk_index(address, chunks, address_index)
        if relevant_idx is None:
            unresolvable.append(q["id"])
            continue

        query_vec = embed_query_fn(q["query"]).astype(np.float32)
        matches = index.search(query_vec, k)

        qrels_dict[q["id"]] = {str(relevant_idx): rel["relevance"]}
        run_dict[q["id"]] = {str(m.key): float(1 - m.distance) for m in matches}

    metrics = evaluate(
        Qrels(qrels_dict), Run(run_dict), ["mrr", f"recall@{k}", f"ndcg@{k}"]
    )

    return {
        "total_queries": len(eval_data["queries"]),
        "resolvable": len(qrels_dict),
        "metrics": metrics,
        "unresolvable": unresolvable,
    }
