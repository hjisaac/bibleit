import json
import logging
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import numpy as np


def setup_logger(name: str, log_path: Path) -> logging.Logger:
    """Returns a logger that writes to both console and the given file."""
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


def trigger_eval(
    eval_path: Path,
    chunks: Sequence[Any],
    chunk_embeddings: np.ndarray,
    address_index: dict[Any, int],
    embed_query_fn: Callable[[str], np.ndarray],
    k: int = 10,
) -> dict[str, Any]:
    """Runs queries in eval set through vector retrieval and returns metrics and diagnostics."""
    from codetiming import Timer
    from tqdm import tqdm
    from usearch.index import Index

    from bibleit_ingest.chunking import resolve_verse_to_chunk_index
    from rag_core.metrics import evaluate_retrieval

    eval_data = json.loads(eval_path.read_text())
    total_q = len(eval_data["queries"])
    logger = logging.getLogger(__name__)
    logger.info("Evaluating %d queries against %d chunks (k=%d)...", total_q, len(chunks), k)

    index = Index(ndim=chunk_embeddings.shape[1], metric="cos")
    index.add(np.arange(len(chunks)), chunk_embeddings.astype(np.float32))

    qrels_dict: dict[str, dict[str, int]] = {}
    run_dict: dict[str, dict[str, float]] = {}
    unresolvable: list[str] = []
    diagnostics: list[dict[str, Any]] = []

    with Timer(text=f"Evaluated {total_q} queries in {{:.1f}}s", logger=logger.info):
        for q in tqdm(eval_data["queries"], total=total_q, desc="evaluating queries", unit="query"):
            rel = q["relevant"][0]
            address = (rel["book"], rel["chapter"], rel["verse"])
            relevant_idx = resolve_verse_to_chunk_index(address, chunks, address_index)
            if relevant_idx is None:
                unresolvable.append(q["id"])
                continue

            query_vec = embed_query_fn(q["query"]).astype(np.float32)
            matches = index.search(query_vec, k)

            target_rank = None
            match_records = []
            for rank, m in enumerate(matches, 1):
                score = round(float(1 - m.distance), 4)
                match_records.append({"rank": rank, "chunk_idx": int(m.key), "score": score})
                if int(m.key) == relevant_idx and target_rank is None:
                    target_rank = rank

            qrels_dict[q["id"]] = {str(relevant_idx): rel["relevance"]}
            run_dict[q["id"]] = {str(m.key): float(1 - m.distance) for m in matches}

            diagnostics.append({
                "id": q["id"],
                "query": q["query"],
                "target_address": address,
                "target_chunk_idx": relevant_idx,
                "target_rank": target_rank,
                "matches": match_records,
            })

    metrics = evaluate_retrieval(qrels_dict, run_dict, ["mrr", f"recall@{k}", f"ndcg@{k}"])
    return {
        "total_queries": len(eval_data["queries"]),
        "resolvable": len(qrels_dict),
        "metrics": metrics,
        "unresolvable": unresolvable,
        "diagnostics": diagnostics,
    }
