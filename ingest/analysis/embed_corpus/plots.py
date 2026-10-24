from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from bibleit_ingest.types import Passage

COLOR_ADJACENT = "#2e7d32"   # Green
COLOR_INTRABOOK = "#3b5ba8"  # Blue
COLOR_CROSSBOOK = "#e07a5f"  # Coral
COLOR_PURPLE = "#6f42c1"     # Purple


def compute_embedding_diagnostics(
    matrix: np.ndarray,
    chunks: Sequence[Passage],
    sample_size: int = 2000,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Computes vector norm, multi-group similarity, and SVD spectral metrics."""
    n, d = matrix.shape
    norms = np.linalg.norm(matrix, axis=1)
    normed = matrix / np.maximum(norms[:, None], 1e-12)

    # 1. Adjacent pairs (consecutive chunks within same book)
    adj_pairs = [(i, i + 1) for i in range(n - 1) if chunks[i].book == chunks[i + 1].book]
    if adj_pairs:
        idx_a1, idx_a2 = zip(*adj_pairs, strict=True)
        sim_adjacent = np.sum(normed[list(idx_a1)] * normed[list(idx_a2)], axis=1)
    else:
        sim_adjacent = np.array([], dtype=np.float32)

    # 2. Group chunk indices by book for structured sampling
    book_to_indices: dict[str, list[int]] = defaultdict(list)
    for i, c in enumerate(chunks):
        book_to_indices[c.book].append(i)

    rng = np.random.default_rng(seed=42)

    # 3. Intra-book non-adjacent pairs
    intra_pairs: list[tuple[int, int]] = []
    books_with_mult = [b for b, idxs in book_to_indices.items() if len(idxs) > 2]
    if books_with_mult:
        for _ in range(sample_size):
            b = rng.choice(books_with_mult)
            idxs = book_to_indices[b]
            i, j = rng.choice(idxs, size=2, replace=False)
            if abs(i - j) > 1:
                intra_pairs.append((int(i), int(j)))

    if intra_pairs:
        i1, i2 = zip(*intra_pairs, strict=True)
        sim_intrabook = np.sum(normed[list(i1)] * normed[list(i2)], axis=1)
    else:
        sim_intrabook = np.array([], dtype=np.float32)

    # 4. Cross-book pairs
    cross_pairs: list[tuple[int, int]] = []
    book_list = list(book_to_indices.keys())
    if len(book_list) > 1:
        for _ in range(sample_size):
            b1, b2 = rng.choice(book_list, size=2, replace=False)
            i = rng.choice(book_to_indices[b1])
            j = rng.choice(book_to_indices[b2])
            cross_pairs.append((int(i), int(j)))

    if cross_pairs:
        c1, c2 = zip(*cross_pairs, strict=True)
        sim_crossbook = np.sum(normed[list(c1)] * normed[list(c2)], axis=1)
    else:
        sim_crossbook = np.array([], dtype=np.float32)

    # 5. SVD & Effective Rank on centered embeddings
    centered = matrix - np.mean(matrix, axis=0)
    singular_values = np.linalg.svd(centered, compute_uv=False)
    # Roy & Vetterli (2007) entropy-based effective rank
    p = singular_values / np.maximum(np.sum(singular_values), 1e-12)
    p_nonzero = p[p > 0]
    effective_rank = float(np.exp(-np.sum(p_nonzero * np.log(p_nonzero))))

    metrics = {
        "norms_mean": round(float(np.mean(norms)), 4),
        "norms_std": round(float(np.std(norms)), 4),
        "norms_min": round(float(np.min(norms)), 4),
        "norms_max": round(float(np.max(norms)), 4),
        "sim_adjacent_mean": round(float(np.mean(sim_adjacent)), 4) if len(sim_adjacent) else 0.0,
        "sim_adjacent_std": round(float(np.std(sim_adjacent)), 4) if len(sim_adjacent) else 0.0,
        "sim_intrabook_mean": round(float(np.mean(sim_intrabook)), 4) if len(sim_intrabook) else 0.0,
        "sim_intrabook_std": round(float(np.std(sim_intrabook)), 4) if len(sim_intrabook) else 0.0,
        "sim_crossbook_mean": round(float(np.mean(sim_crossbook)), 4) if len(sim_crossbook) else 0.0,
        "sim_crossbook_std": round(float(np.std(sim_crossbook)), 4) if len(sim_crossbook) else 0.0,
        "effective_rank": round(effective_rank, 2),
    }

    plot_data = {
        "norms": norms,
        "sim_adjacent": sim_adjacent,
        "sim_intrabook": sim_intrabook,
        "sim_crossbook": sim_crossbook,
        "singular_values": singular_values,
        "effective_rank": effective_rank,
    }

    return metrics, plot_data


def plot_pairwise_similarities(plot_data: dict[str, Any], out_path: Path) -> Path:
    """Plots pairwise cosine similarity KDEs and box distributions across sampling categories."""
    groups = [
        ("Adjacent (Narrative)", plot_data["sim_adjacent"], COLOR_ADJACENT),
        ("Intra-Book (Same Book)", plot_data["sim_intrabook"], COLOR_INTRABOOK),
        ("Cross-Book (Background)", plot_data["sim_crossbook"], COLOR_CROSSBOOK),
    ]

    fig, (ax_kde, ax_box) = plt.subplots(1, 2, figsize=(14, 5.5))

    # Panel 1: Overlaid histograms & means
    for label, arr, col in groups:
        if len(arr) == 0:
            continue
        ax_kde.hist(arr, bins=40, density=True, alpha=0.35, color=col, label=label)
        mean_val = np.mean(arr)
        ax_kde.axvline(mean_val, color=col, linestyle="--", linewidth=1.8, label=f"{label} μ={mean_val:.2f}")

    ax_kde.set_title("Cosine Similarity by Passage Relationship", fontsize=11, fontweight="bold")
    ax_kde.set_xlabel("Cosine Similarity", fontsize=10)
    ax_kde.set_ylabel("Density", fontsize=10)
    ax_kde.legend(loc="upper left", fontsize=8.5, framealpha=0.9)
    ax_kde.grid(axis="y", alpha=0.3)

    # Panel 2: Side-by-side boxplots
    data_to_plot = [arr for _, arr, _ in groups if len(arr) > 0]
    labels_to_plot = [label for label, arr, _ in groups if len(arr) > 0]
    box = ax_box.boxplot(
        data_to_plot,
        tick_labels=labels_to_plot,
        patch_artist=True,
        showmeans=True,
        meanprops={"marker": "o", "markerfacecolor": "white", "markeredgecolor": "black", "markersize": 6},
    )

    colors = [col for _, arr, col in groups if len(arr) > 0]
    for patch, col in zip(box["boxes"], colors, strict=False):
        patch.set_facecolor(col)
        patch.set_alpha(0.5)

    ax_box.set_title("Distribution Spread & Interquartile Ranges", fontsize=11, fontweight="bold")
    ax_box.set_ylabel("Cosine Similarity", fontsize=10)
    ax_box.grid(axis="y", alpha=0.3)

    fig.suptitle("Embedding Vector Space Pairwise Similarities", fontsize=13, fontweight="bold", y=0.98)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def plot_vector_geometry(plot_data: dict[str, Any], out_path: Path) -> Path:
    """Plots vector L2 norm distribution and SVD singular value decay spectrum."""
    norms = plot_data["norms"]
    s = plot_data["singular_values"]
    erank = plot_data["effective_rank"]

    fig, (ax_norm, ax_svd) = plt.subplots(1, 2, figsize=(14, 5.5))

    # Panel 1: L2 Norm distribution
    ax_norm.hist(norms, bins=35, density=True, color=COLOR_PURPLE, alpha=0.5, edgecolor="white")
    mean_norm = float(np.mean(norms))
    std_norm = float(np.std(norms))
    ax_norm.axvline(mean_norm, color="#d9534f", linestyle="--", linewidth=1.8, label=f"Mean: {mean_norm:.2f}")
    ax_norm.axvline(mean_norm - std_norm, color="#666666", linestyle=":", label=f"±1σ: [{mean_norm - std_norm:.2f}, {mean_norm + std_norm:.2f}]")
    ax_norm.axvline(mean_norm + std_norm, color="#666666", linestyle=":")

    ax_norm.set_title("Passage Vector L2 Norm Distribution", fontsize=11, fontweight="bold")
    ax_norm.set_xlabel("Vector L2 Norm ||v||_2", fontsize=10)
    ax_norm.set_ylabel("Density", fontsize=10)
    ax_norm.legend(loc="upper right", fontsize=8.5, framealpha=0.9)
    ax_norm.grid(axis="y", alpha=0.3)

    # Panel 2: SVD spectrum & cumulative explained variance
    top_k = min(50, len(s))
    indices = np.arange(1, top_k + 1)
    var_explained = (s ** 2) / np.sum(s ** 2)
    cum_var = np.cumsum(var_explained)[:top_k]

    ax_svd.plot(indices, s[:top_k], color=COLOR_INTRABOOK, marker="o", markersize=4, label="Singular Value")
    ax_svd.set_xlabel("Component Index", fontsize=10)
    ax_svd.set_ylabel("Singular Value (Scree)", fontsize=10, color=COLOR_INTRABOOK)
    ax_svd.grid(alpha=0.3)

    # Dual-axis for cumulative variance
    ax_var = ax_svd.twinx()
    ax_var.plot(indices, cum_var * 100, color=COLOR_CROSSBOOK, linestyle="--", label="Cumulative Variance (%)")
    ax_var.set_ylabel("Cumulative Variance (%)", fontsize=10, color=COLOR_CROSSBOOK)
    ax_var.set_ylim(0, 105)

    title = f"Top {top_k} SVD Spectrum (Effective Rank: {erank:.1f}/{len(s)})"
    ax_svd.set_title(title, fontsize=11, fontweight="bold")

    fig.suptitle("Embedding Vector Space Geometry & Dimensionality", fontsize=13, fontweight="bold", y=0.98)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def generate_embedding_plots(plot_data: dict[str, Any], out_dir: Path) -> dict[str, Path]:
    """Generates all embedding diagnostic figures and returns map of artifact paths."""
    sim_path = out_dir / "pairwise_similarity_diagnostics.png"
    geom_path = out_dir / "vector_geometry_diagnostics.png"

    plot_pairwise_similarities(plot_data, sim_path)
    plot_vector_geometry(plot_data, geom_path)

    return {
        "pairwise_similarity_diagnostics": sim_path,
        "vector_geometry_diagnostics": geom_path,
    }
