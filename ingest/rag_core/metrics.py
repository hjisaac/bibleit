from typing import Sequence


def compute_reciprocal_rank(retrieved_ids: Sequence[int | str], relevant_id: int | str) -> float:
    """Computes Mean Reciprocal Rank (MRR) for a single query."""
    for rank, item_id in enumerate(retrieved_ids, start=1):
        if item_id == relevant_id:
            return 1.0 / rank
    return 0.0


def compute_recall_at_k(retrieved_ids: Sequence[int | str], relevant_id: int | str, k: int) -> float:
    """Computes Recall@k for a single relevant ground truth target."""
    return 1.0 if relevant_id in retrieved_ids[:k] else 0.0
