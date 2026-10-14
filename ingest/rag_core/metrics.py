from typing import Sequence
from ranx import Qrels, Run, evaluate


def evaluate_retrieval(
    qrels: dict[str, dict[str, int]] | Qrels,
    run: dict[str, dict[str, float]] | Run,
    metrics: Sequence[str] = ("mrr", "recall@1", "recall@5", "recall@10", "ndcg@10"),
) -> dict[str, float] | float:
    """Evaluates IR retrieval run against ground-truth qrels using ranx."""
    q = qrels if isinstance(qrels, Qrels) else Qrels(qrels)
    r = run if isinstance(run, Run) else Run(run)
    return evaluate(q, r, list(metrics))
