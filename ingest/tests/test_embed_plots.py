from pathlib import Path

import numpy as np

from analysis.embed_corpus.plots import (
    compute_embedding_diagnostics,
    generate_embedding_plots,
)
from bibleit_ingest.types import Passage


def test_compute_embedding_diagnostics_and_plots(tmp_path: Path) -> None:
    # 6 chunks across 2 books
    chunks = [
        Passage(book="GEN", start=(1, 1), end=(1, 2)),
        Passage(book="GEN", start=(1, 3), end=(1, 4)),
        Passage(book="GEN", start=(1, 5), end=(1, 6)),
        Passage(book="MAT", start=(1, 1), end=(1, 2)),
        Passage(book="MAT", start=(1, 3), end=(1, 4)),
        Passage(book="MAT", start=(1, 5), end=(1, 6)),
    ]

    rng = np.random.default_rng(seed=42)
    # 6 vectors in 16 dimensions
    matrix = rng.normal(size=(6, 16)).astype(np.float32)

    metrics, plot_data = compute_embedding_diagnostics(matrix, chunks, sample_size=10)

    assert "norms_mean" in metrics
    assert "sim_adjacent_mean" in metrics
    assert "sim_intrabook_mean" in metrics
    assert "sim_crossbook_mean" in metrics
    assert "effective_rank" in metrics

    assert len(plot_data["norms"]) == 6
    assert len(plot_data["singular_values"]) == 6
    assert plot_data["effective_rank"] > 0

    plot_paths = generate_embedding_plots(plot_data, tmp_path)

    assert "pairwise_similarity_diagnostics" in plot_paths
    assert "vector_geometry_diagnostics" in plot_paths

    sim_file = plot_paths["pairwise_similarity_diagnostics"]
    geom_file = plot_paths["vector_geometry_diagnostics"]

    assert sim_file.exists() and sim_file.stat().st_size > 0
    assert geom_file.exists() and geom_file.stat().st_size > 0
