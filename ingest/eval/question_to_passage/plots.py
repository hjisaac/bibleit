from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

COLOR_HIT = "#2e7d32"       # Dark green for rank 1
COLOR_INTER = "#3b5ba8"     # Soft blue for ranks 2..k
COLOR_MISS = "#d9534f"      # Coral/red for misses
COLOR_LINE = "#1f77b4"      # Line color for cumulative curve


def generate_retrieval_plots(
    diagnostics: list[dict[str, Any]],
    metrics: dict[str, float],
    k: int,
    out_dir: Path,
) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "retrieval_diagnostics.png"
    total = len(diagnostics)
    if total == 0:
        return {"retrieval_diagnostics": out_path}

    ranks = [d.get("target_rank") for d in diagnostics]
    rank_counts = {r: ranks.count(r) for r in range(1, k + 1)}
    miss_count = ranks.count(None)

    # Cumulative hit rate from rank 1 to k
    cum_hits = []
    running = 0
    for r in range(1, k + 1):
        running += rank_counts[r]
        cum_hits.append(running / total)

    fig, (ax_rank, ax_cum) = plt.subplots(1, 2, figsize=(13, 5))
    fig.patch.set_facecolor("#fafafa")

    # 1. Rank distribution histogram
    labels = [f"Rank {r}" for r in range(1, k + 1)] + ["Miss (> k)"]
    counts = [rank_counts[r] for r in range(1, k + 1)] + [miss_count]
    colors = [COLOR_HIT] + [COLOR_INTER] * (k - 1) + [COLOR_MISS]

    bars = ax_rank.bar(labels, counts, color=colors, edgecolor="black", alpha=0.85, width=0.6)
    ax_rank.set_facecolor("#ffffff")
    ax_rank.grid(True, linestyle="--", alpha=0.4, axis="y")
    ax_rank.set_ylabel("Query Count", fontsize=11, fontweight="bold")
    ax_rank.set_title("Target Rank Distribution", fontsize=12, fontweight="bold")
    ax_rank.tick_params(axis="x", rotation=30 if k > 5 else 0)

    # Label counts and percentages on top of bars
    for bar, c in zip(bars, counts, strict=True):
        pct = (c / total) * 100
        ax_rank.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + (total * 0.015),
            f"{c}\n({pct:.1f}%)",
            ha="center",
            va="bottom",
            fontsize=8 if k > 5 else 9,
        )
    ax_rank.set_ylim(0, max(counts) * 1.25 if counts else 1)

    # 2. Cumulative Hit Rate curve (Hit@1 to Hit@k)
    r_range = list(range(1, k + 1))
    ax_cum.plot(r_range, cum_hits, marker="o", color=COLOR_LINE, linewidth=2.2, label="Cumulative Hit Rate")
    ax_cum.fill_between(r_range, cum_hits, color=COLOR_LINE, alpha=0.15)
    ax_cum.set_facecolor("#ffffff")
    ax_cum.grid(True, linestyle="--", alpha=0.5)
    ax_cum.set_xlabel("Rank (k)", fontsize=11, fontweight="bold")
    ax_cum.set_ylabel("Cumulative Hit Rate", fontsize=11, fontweight="bold")
    ax_cum.set_title("Hit Rate vs Rank Ceiling (1..k)", fontsize=12, fontweight="bold")
    ax_cum.set_ylim(0, 1.05)
    ax_cum.set_xticks(r_range)

    # Annotated summary box with Ranx metrics
    mrr_val = metrics.get("mrr", 0.0)
    hit1_val = metrics.get("hit_rate@1", metrics.get(f"hit_rate@{k}", 0.0))
    hitk_val = cum_hits[-1] if cum_hits else 0.0
    textstr = "\n".join((
        f"Queries: {total}",
        f"MRR: {mrr_val:.4f}",
        f"Hit@1: {hit1_val:.4f}",
        f"Hit@{k}: {hitk_val:.4f}",
    ))
    props = dict(boxstyle="round,pad=0.5", facecolor="#ffffff", edgecolor="#cccccc", alpha=0.9)
    ax_cum.text(0.60, 0.15, textstr, transform=ax_cum.transAxes, fontsize=10, bbox=props)

    plt.tight_layout()
    out_path = out_dir / "retrieval_diagnostics.png"
    fig.savefig(out_path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return {"retrieval_diagnostics": out_path}
