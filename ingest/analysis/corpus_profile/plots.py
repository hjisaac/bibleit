from collections import Counter
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
from matplotlib.patches import Patch
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

from bibleit_ingest.constants import OLD_TESTAMENT_BOOKS, USFM_ORDER


def plot_pericope_overview(
    records: list[dict[str, Any]],
    out_path: Path,
    token_limit: int = 512,
) -> Path:
    token_lengths = np.array([r["token_count"] for r in records])
    mean_val = float(np.mean(token_lengths))
    p50_val = float(np.percentile(token_lengths, 50))
    p95_val = float(np.percentile(token_lengths, 95))
    under_100 = int(np.sum(token_lengths < 100))
    over_limit = int(np.sum(token_lengths > token_limit))
    n = len(token_lengths)

    fig, (ax_dist, ax_box) = plt.subplots(1, 2, figsize=(15, 6))

    # Panel 1: Pericope token distribution
    sns.histplot(
        token_lengths,
        kde=True,
        bins=40,
        color="#2b5c8f",
        ax=ax_dist,
        edgecolor="white",
        alpha=0.6,
    )
    ax_dist.axvline(token_limit, color="#d9534f", linestyle="--", linewidth=2, label=f"Limit ({token_limit} toks)")
    ax_dist.axvline(400, color="#fd7e14", linestyle="--", linewidth=1.5, label="Safe Ceiling (400 toks)")
    ax_dist.axvline(p50_val, color="#28a745", linestyle=":", linewidth=2, label=f"Median ({int(p50_val)} toks)")
    ax_dist.axvline(100, color="#6f42c1", linestyle=":", linewidth=1.5, label="Floor (100 toks)")

    stat_text = (
        f"Raw Pericopes: {n}\n"
        f"Median: {int(p50_val)} | Mean: {int(mean_val)}\n"
        f"P95: {int(p95_val)} | Max: {int(np.max(token_lengths))}\n"
        f"Underflow (< 100): {under_100} ({under_100 / n * 100:.1f}%)\n"
        f"Overflow (> {token_limit}): {over_limit} ({over_limit / n * 100:.1f}%)"
    )
    ax_dist.text(
        0.97, 0.95, stat_text,
        transform=ax_dist.transAxes,
        verticalalignment="top",
        horizontalalignment="right",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#f8f9fa", edgecolor="#ced4da", alpha=0.9),
        fontsize=9,
    )
    ax_dist.set_title("Raw Pericope Token Length Distribution", fontsize=12, fontweight="bold")
    ax_dist.set_xlabel("Tokens per Pericope", fontsize=10)
    ax_dist.set_ylabel("Pericope Frequency", fontsize=10)
    ax_dist.legend(loc="upper right", framealpha=0.9, bbox_to_anchor=(0.95, 0.65))
    ax_dist.grid(axis="y", alpha=0.3)

    # Panel 2: Box & beeswarm density by testament
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
    ax_box.axhline(100, color="#6f42c1", linestyle=":", linewidth=1.5, label="Floor (100)")
    ax_box.set_title("Raw Pericope Tokens by Testament", fontsize=12, fontweight="bold")
    ax_box.set_xlabel("Corpus Division", fontsize=10)
    ax_box.set_ylabel("Tokens per Pericope", fontsize=10)
    ax_box.legend(loc="upper right", framealpha=0.9)
    ax_box.grid(axis="y", alpha=0.3)

    fig.suptitle("BSB Native Pericope Profile (Unchunked Baseline)", fontsize=14, fontweight="bold", y=0.98)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def plot_verse_overview(
    records: list[dict[str, Any]],
    out_path: Path,
) -> Path:
    words = np.array([r["word_count"] for r in records])
    tokens = np.array([r["token_count"] for r in records])
    ratio = tokens / np.maximum(words, 1)

    fig, (ax_ratio, ax_box) = plt.subplots(1, 2, figsize=(15, 6))

    # Panel 1: Subword expansion distribution (tokens / word)
    sns.histplot(
        ratio,
        kde=True,
        bins=35,
        color="#2e7d32",
        ax=ax_ratio,
        edgecolor="white",
        alpha=0.6,
    )
    mean_ratio = float(np.mean(ratio))
    ax_ratio.axvline(mean_ratio, color="#d9534f", linestyle="--", linewidth=2, label=f"Mean Ratio ({mean_ratio:.2f}x)")
    ax_ratio.set_title("Subword Inflation: Tokens per Word (Verses)", fontsize=12, fontweight="bold")
    ax_ratio.set_xlabel("Ratio (Tokens / Word)", fontsize=10)
    ax_ratio.set_ylabel("Verse Frequency", fontsize=10)
    ax_ratio.legend(loc="upper right", framealpha=0.9)
    ax_ratio.grid(axis="y", alpha=0.3)

    # Panel 2: Verse tokens across OT vs NT
    data = {
        "testament": ["Old Testament" if r.get("testament") == "OT" else "New Testament" for r in records],
        "token_count": tokens,
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
    ax_box.set_title("Verse Token Length by Testament", fontsize=12, fontweight="bold")
    ax_box.set_xlabel("Corpus Division", fontsize=10)
    ax_box.set_ylabel("Tokens per Verse", fontsize=10)
    ax_box.grid(axis="y", alpha=0.3)

    fig.suptitle("Verse & Lexical Profile (31,100 Verses)", fontsize=14, fontweight="bold", y=0.98)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def plot_headings_per_book(records: list[dict[str, Any]], out_path: Path) -> Path:
    counts = Counter(r["book"] for r in records)
    books = [b for b in USFM_ORDER if b in counts]
    vals = [counts[b] for b in books]
    colors = ["#4a7bb0" if b in OLD_TESTAMENT_BOOKS else "#e07a5f" for b in books]

    fig, ax = plt.subplots(figsize=(14, 4.5))
    ax.bar(range(len(books)), vals, color=colors, width=0.85)
    ax.set_xticks(range(len(books)))
    ax.set_xticklabels(books, rotation=90, fontsize=7)
    ax.set_ylabel("Pericope Headings", fontsize=10)
    ax.set_title("BSB Pericope Headings per Book (Canonical Order: Genesis → Revelation)", fontsize=12, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    ax.spines[["top", "right"]].set_visible(False)

    ot_count = sum(1 for b in books if b in OLD_TESTAMENT_BOOKS)
    ax.axvline(ot_count - 0.5, color="#888888", linestyle="--", linewidth=1)

    ax.legend(handles=[
        Patch(color="#4a7bb0", label="Old Testament"),
        Patch(color="#e07a5f", label="New Testament"),
    ], loc="upper right", framealpha=0.9)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    return out_path


def generate_corpus_plots(
    verse_records: list[dict[str, Any]],
    pericope_records: list[dict[str, Any]],
    out_dir: Path,
    token_limit: int = 512,
) -> dict[str, Path]:
    pericope_path = out_dir / "pericope_overview.png"
    verse_path = out_dir / "verse_overview.png"
    headings_path = out_dir / "headings_per_book.png"

    plot_pericope_overview(pericope_records, pericope_path, token_limit=token_limit)
    plot_verse_overview(verse_records, verse_path)
    plot_headings_per_book(pericope_records, headings_path)

    return {
        "pericope_overview": pericope_path,
        "verse_overview": verse_path,
        "headings_per_book": headings_path,
    }
