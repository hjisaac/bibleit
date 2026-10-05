from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns


def plot_token_distribution(records: list[dict[str, Any]], out_path: Path, token_limit: int = 512) -> Path:
    token_lengths = np.array([r["token_count"] for r in records])
    mean_val = float(np.mean(token_lengths))
    p50_val = float(np.percentile(token_lengths, 50))
    p95_val = float(np.percentile(token_lengths, 95))
    truncated = int(np.sum(token_lengths > token_limit))
    trunc_pct = (truncated / len(token_lengths) * 100) if len(token_lengths) else 0.0

    fig, ax = plt.subplots(figsize=(9, 5))
    sns.histplot(token_lengths, kde=True, bins=40, color="#2b5c8f", ax=ax, edgecolor="white", alpha=0.6)

    ax.axvline(token_limit, color="#d9534f", linestyle="--", linewidth=2, label=f"Limit ({token_limit} toks)")
    ax.axvline(p50_val, color="#28a745", linestyle=":", linewidth=2, label=f"Median ({int(p50_val)} toks)")
    ax.axvline(mean_val, color="#fd7e14", linestyle="-.", linewidth=1.5, label=f"Mean ({int(mean_val)} toks)")

    stat_text = (
        f"Chunks: {len(token_lengths)}\n"
        f"Median: {int(p50_val)} | Mean: {int(mean_val)}\n"
        f"P95: {int(p95_val)} | Max: {int(np.max(token_lengths))}\n"
        f"Truncated (> {token_limit}): {truncated} ({trunc_pct:.1f}%)"
    )
    ax.text(
        0.97, 0.95, stat_text,
        transform=ax.transAxes,
        verticalalignment="top",
        horizontalalignment="right",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#f8f9fa", edgecolor="#ced4da", alpha=0.9),
        fontsize=9,
    )

    ax.set_title("Chunk Token Length Distribution", fontsize=13, fontweight="bold")
    ax.set_xlabel("Tokens per Chunk", fontsize=11)
    ax.set_ylabel("Chunk Frequency", fontsize=11)
    ax.legend(loc="upper left", framealpha=0.9)
    ax.grid(axis="y", alpha=0.3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def plot_beeswarm_box(records: list[dict[str, Any]], out_path: Path, token_limit: int = 512) -> Path:
    data = {
        "testament": ["Old Testament" if r.get("testament") == "OT" else "New Testament" for r in records],
        "token_count": [r["token_count"] for r in records],
    }

    fig, ax = plt.subplots(figsize=(8, 6))
    palette = {"Old Testament": "#4a7bb0", "New Testament": "#e07a5f"}

    # Box plot showing quartiles and median
    sns.boxplot(
        data=data,
        x="testament",
        y="token_count",
        hue="testament",
        palette=palette,
        ax=ax,
        width=0.45,
        boxprops=dict(alpha=0.4),
        showmeans=True,
        meanprops={"marker": "o", "markerfacecolor": "white", "markeredgecolor": "black", "markersize": "6"},
        legend=False,
    )

    # Jittered strip overlay giving beeswarm-style density & outlier visibility
    sns.stripplot(
        data=data,
        x="testament",
        y="token_count",
        hue="testament",
        palette=palette,
        ax=ax,
        jitter=0.25,
        size=3.5,
        alpha=0.35,
        legend=False,
    )

    ax.axhline(token_limit, color="#d9534f", linestyle="--", linewidth=1.8, label=f"Token Limit ({token_limit})")
    ax.set_title("Chunk Token Distribution: Box & Density by Testament", fontsize=13, fontweight="bold")
    ax.set_xlabel("Corpus Division", fontsize=11)
    ax.set_ylabel("Tokens per Chunk", fontsize=11)
    ax.legend(loc="upper right", framealpha=0.9)
    ax.grid(axis="y", alpha=0.3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def plot_chunk_overview(records: list[dict[str, Any]], out_path: Path, token_limit: int = 512) -> Path:
    """One-shot dashboard combining distribution and beeswarm/box plots."""
    token_lengths = np.array([r["token_count"] for r in records])
    mean_val = float(np.mean(token_lengths))
    p50_val = float(np.percentile(token_lengths, 50))
    p95_val = float(np.percentile(token_lengths, 95))
    truncated = int(np.sum(token_lengths > token_limit))
    trunc_pct = (truncated / len(token_lengths) * 100) if len(token_lengths) else 0.0

    fig, (ax_dist, ax_box) = plt.subplots(1, 2, figsize=(15, 6))

    # Panel 1: Distribution
    sns.histplot(token_lengths, kde=True, bins=35, color="#2b5c8f", ax=ax_dist, edgecolor="white", alpha=0.6)
    ax_dist.axvline(token_limit, color="#d9534f", linestyle="--", linewidth=2, label=f"Limit ({token_limit})")
    ax_dist.axvline(p50_val, color="#28a745", linestyle=":", linewidth=2, label=f"Median ({int(p50_val)})")
    ax_dist.axvline(mean_val, color="#fd7e14", linestyle="-.", linewidth=1.5, label=f"Mean ({int(mean_val)})")

    stat_text = (
        f"Chunks: {len(token_lengths)}\n"
        f"Median: {int(p50_val)} | Mean: {int(mean_val)}\n"
        f"P95: {int(p95_val)} | Max: {int(np.max(token_lengths))}\n"
        f"Truncated (> {token_limit}): {truncated} ({trunc_pct:.1f}%)"
    )
    ax_dist.text(
        0.97, 0.95, stat_text,
        transform=ax_dist.transAxes,
        verticalalignment="top",
        horizontalalignment="right",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#f8f9fa", edgecolor="#ced4da", alpha=0.9),
        fontsize=9,
    )
    ax_dist.set_title("Token Length Distribution", fontsize=12, fontweight="bold")
    ax_dist.set_xlabel("Tokens per Chunk", fontsize=10)
    ax_dist.set_ylabel("Chunk Frequency", fontsize=10)
    ax_dist.legend(loc="upper left", framealpha=0.9)
    ax_dist.grid(axis="y", alpha=0.3)

    # Panel 2: Box + Beeswarm
    data = {
        "testament": ["Old Testament" if r.get("testament") == "OT" else "New Testament" for r in records],
        "token_count": [r["token_count"] for r in records],
    }
    palette = {"Old Testament": "#4a7bb0", "New Testament": "#e07a5f"}

    sns.boxplot(
        data=data,
        x="testament",
        y="token_count",
        hue="testament",
        palette=palette,
        ax=ax_box,
        width=0.45,
        boxprops=dict(alpha=0.4),
        showmeans=True,
        meanprops={"marker": "o", "markerfacecolor": "white", "markeredgecolor": "black", "markersize": "6"},
        legend=False,
    )
    sns.stripplot(
        data=data,
        x="testament",
        y="token_count",
        hue="testament",
        palette=palette,
        ax=ax_box,
        jitter=0.25,
        size=3.5,
        alpha=0.35,
        legend=False,
    )
    ax_box.axhline(token_limit, color="#d9534f", linestyle="--", linewidth=1.8, label=f"Limit ({token_limit})")
    ax_box.set_title("Density & Outliers by Testament", fontsize=12, fontweight="bold")
    ax_box.set_xlabel("Corpus Division", fontsize=10)
    ax_box.set_ylabel("Tokens per Chunk", fontsize=10)
    ax_box.legend(loc="upper right", framealpha=0.9)
    ax_box.grid(axis="y", alpha=0.3)

    fig.suptitle("Chunking Strategy Analysis Overview", fontsize=14, fontweight="bold", y=0.98)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def generate_chunk_plots(records: list[dict[str, Any]], out_dir: Path, token_limit: int = 512) -> dict[str, Path]:
    """Generate and return paths for distplot, beeswarm/box plot, and one-shot overview."""
    overview_path = out_dir / "chunk_overview.png"
    dist_path = out_dir / "token_distribution.png"
    box_path = out_dir / "beeswarm_box_plot.png"

    plot_chunk_overview(records, overview_path, token_limit=token_limit)
    plot_token_distribution(records, dist_path, token_limit=token_limit)
    plot_beeswarm_box(records, box_path, token_limit=token_limit)

    return {
        "chunk_overview": overview_path,
        "token_distribution": dist_path,
        "beeswarm_box_plot": box_path,
    }
