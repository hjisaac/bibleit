import json
import logging
from pathlib import Path
from typing import Any, Callable, Sequence

from codetiming import Timer
import numpy as np
from tqdm import tqdm
from usearch.index import Index

from rag_core.metrics import evaluate_retrieval
from .chunking import build_verse_to_chunk_index
from .types import BookCorpus, Passage, VerseAddress


def setup_logger(log_path: Path) -> logging.Logger:
    logger = logging.getLogger("eval")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


def trigger_retrieval_eval(
    eval_path: Path,
    chunks: Sequence[Passage],
    chunk_embeddings: np.ndarray,
    corpus: BookCorpus,
    embed_query_fn: Callable[[str], np.ndarray],
    k: int = 10,
    verse_to_chunks: dict[VerseAddress, list[int]] | None = None,
) -> dict[str, Any]:
    """Runs queries in eval set through vector retrieval using O(1) inverted verse lookup."""
    eval_data = json.loads(eval_path.read_text())
    total_q = len(eval_data["queries"])
    logger = logging.getLogger(__name__)
    logger.info("Evaluating %d queries against %d chunks (k=%d)...", total_q, len(chunks), k)

    index = Index(ndim=chunk_embeddings.shape[1], metric="cos")
    index.add(np.arange(len(chunks)), chunk_embeddings.astype(np.float32))

    v_map = verse_to_chunks if verse_to_chunks is not None else build_verse_to_chunk_index(corpus, chunks)

    qrels_dict: dict[str, dict[str, int]] = {}
    run_dict: dict[str, dict[str, float]] = {}
    unresolvable: list[str] = []
    diagnostics: list[dict[str, Any]] = []

    with Timer(text=f"Evaluated {total_q} queries in {{:.1f}}s", logger=logger.info):
        for q in tqdm(eval_data["queries"], total=total_q, desc="evaluating queries", unit="query"):
            rel = q["relevant"][0]
            address = (rel["book"], rel["chapter"], rel["verse"])
            relevant_indices = v_map.get(address, [])
            if not relevant_indices:
                unresolvable.append(q["id"])
                continue

            query_vec = embed_query_fn(q["query"]).astype(np.float32)
            matches = index.search(query_vec, k)

            target_rank = None
            match_records = []
            rel_set = set(relevant_indices)
            for rank, m in enumerate(matches, 1):
                score = round(float(1 - m.distance), 4)
                match_records.append({"rank": rank, "chunk_idx": int(m.key), "score": score})
                if int(m.key) in rel_set and target_rank is None:
                    target_rank = rank

            qrels_dict[q["id"]] = {str(idx): rel["relevance"] for idx in relevant_indices}
            run_dict[q["id"]] = {str(m.key): float(1 - m.distance) for m in matches}

            diagnostics.append({
                "id": q["id"],
                "query": q["query"],
                "target_address": address,
                "target_chunk_idx": relevant_indices[0],
                "relevant_chunks": relevant_indices,
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
