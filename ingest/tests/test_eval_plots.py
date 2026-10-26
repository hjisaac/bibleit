from pathlib import Path
from eval.question_to_passage.plots import generate_retrieval_plots


def test_generate_retrieval_plots(tmp_path: Path):
    diagnostics = [
        {"id": "q1", "target_rank": 1},
        {"id": "q2", "target_rank": 2},
        {"id": "q3", "target_rank": None},
        {"id": "q4", "target_rank": 1},
    ]
    metrics = {
        "mrr": 0.625,
        "hit_rate@1": 0.5,
        "hit_rate@3": 0.75,
        "ndcg@3": 0.65,
    }
    plot_path = generate_retrieval_plots(diagnostics, metrics, k=3, out_dir=tmp_path)
    assert plot_path.exists()
    assert plot_path.stat().st_size > 0
