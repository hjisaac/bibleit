from pathlib import Path
import json
import matplotlib.pyplot as plt
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
FIG_DIR = SCRIPT_DIR / "figures"
FIG_DIR.mkdir(exist_ok=True)
SWEEP_DIR = SCRIPT_DIR.parent / "analysis" / "chunking_strategy" / "outputs"

# Color palette aligned with project conventions
PRIMARY_COLOR = "#3B5BA8"
SECONDARY_COLOR = "#B8792E"
ACCENT_RED = "#B3403B"
ACCENT_GREEN = "#2E7D32"
GRID_COLOR = "#E0E0E0"


def load_runs():
    runs = []
    for p in SWEEP_DIR.glob("*/run.json"):
        try:
            with open(p) as f:
                d = json.load(f)
            rc = d.get("run_conditions", {})
            m = d.get("metrics", {})
            if "floor" in rc and m:
                runs.append({
                    "floor": rc["floor"],
                    "ceiling": rc["ceiling"],
                    "overlap": rc["overlap"],
                    "strategy": rc["render_strategy"],
                    "p50_tokens": m["p50_tokens"],
                    "p90_tokens": m["p90_tokens"],
                    "p95_tokens": m["p95_tokens"],
                    "max_tokens": m["max_tokens"],
                    "truncation_pct": m["truncation_pct"],
                    "total_chunks": m["total_chunks"],
                })
        except Exception:
            continue
    return runs


def plot_ablation_truncation_vs_model_window(runs):
    """Plot 1: Perceived 512-token SLA truncation vs True 8192-token Nomic Context Window."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Left: Truncation rate by floor & ceiling (against the artificial 512 token SLA)
    grouped = {}
    for r in runs:
        key = (r["floor"], r["ceiling"])
        grouped.setdefault(key, []).append(r["truncation_pct"])

    labels = [f"f={k[0]}, c={k[1]}" for k in sorted(grouped.keys())]
    mins = [min(grouped[k]) for k in sorted(grouped.keys())]
    maxs = [max(grouped[k]) for k in sorted(grouped.keys())]
    means = [np.mean(grouped[k]) for k in sorted(grouped.keys())]

    x = np.arange(len(labels))
    ax1.bar(x, means, yerr=[[means[i] - mins[i] for i in range(len(x))],
                           [maxs[i] - means[i] for i in range(len(x))]],
            capsize=4, color=PRIMARY_COLOR, alpha=0.85, width=0.55, edgecolor="none")

    ax1.set_title("Sweep Truncation Rate under 512-Token SLA\n(Min / Mean / Max across strategies & overlaps)", fontsize=11, fontweight="bold")
    ax1.set_ylabel("% Chunks Exceeding 512 Tokens", fontsize=10)
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels, rotation=30, ha="right", fontsize=9)
    ax1.grid(axis="y", linestyle="--", alpha=0.7, color=GRID_COLOR)
    ax1.spines[["top", "right"]].set_visible(False)

    # Right: Real world chunk size distribution vs Model Window (8192)
    sample_run_p50 = [r["p50_tokens"] for r in runs]
    sample_run_p90 = [r["p90_tokens"] for r in runs]
    sample_run_p95 = [r["p95_tokens"] for r in runs]
    sample_run_max = [r["max_tokens"] for r in runs]

    categories = ["Median (p50)", "p90", "p95", "Max Chunk\n(Psalm 119)"]
    vals = [np.median(sample_run_p50), np.median(sample_run_p90), np.median(sample_run_p95), max(sample_run_max)]
    colors = [PRIMARY_COLOR, PRIMARY_COLOR, PRIMARY_COLOR, SECONDARY_COLOR]

    bars = ax2.bar(categories, vals, color=colors, width=0.55)
    ax2.axhline(512, color=ACCENT_RED, linestyle="--", linewidth=1.5, label="Old Profiling SLA: 512 tokens")
    ax2.axhline(8192, color=ACCENT_GREEN, linestyle="-.", linewidth=2, label="Actual Model Limit: 8,192 tokens")

    for bar in bars:
        h = bar.get_height()
        ax2.annotate(f"{int(h)} tok",
                     xy=(bar.get_x() + bar.get_width() / 2, h),
                     xytext=(0, 4), textcoords="offset points",
                     ha="center", va="bottom", fontsize=9, fontweight="bold")

    ax2.set_title("Corpus Token Lengths vs Nomic v1.5 Window (8,192)", fontsize=11, fontweight="bold")
    ax2.set_ylabel("Tokens", fontsize=10)
    ax2.set_yscale("log")
    ax2.set_ylim(50, 12000)
    ax2.grid(axis="y", which="both", linestyle="--", alpha=0.7, color=GRID_COLOR)
    ax2.legend(loc="upper left", fontsize=9)
    ax2.spines[["top", "right"]].set_visible(False)

    fig.tight_layout()
    fig.savefig(FIG_DIR / "ablation_token_context_window_comparison.png", dpi=200)
    fig.savefig(FIG_DIR / "ablation_token_context_window_comparison.svg")
    plt.close(fig)


def plot_token_growth_by_strategy(runs):
    """Plot 2: Token distribution percentiles across rendering strategies and overlaps."""
    strategies = ["text_only", "heading_and_text", "book_and_heading", "address_and_heading"]
    strat_labels = ["Text Only", "+ Heading", "+ Book Heading", "+ Address Heading"]

    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(strategies))
    width = 0.25

    for idx, ov in enumerate([0, 1, 2]):
        subset = [r for r in runs if r["overlap"] == ov]
        strat_p50 = []
        for s in strategies:
            s_runs = [r["p50_tokens"] for r in subset if r["strategy"] == s]
            strat_p50.append(np.mean(s_runs) if s_runs else 0)

        offset = (idx - 1) * width
        rects = ax.bar(x + offset, strat_p50, width, label=f"overlap = {ov} verses", alpha=0.9)
        for rect in rects:
            h = rect.get_height()
            ax.annotate(f"{int(h)}",
                        xy=(rect.get_x() + rect.get_width() / 2, h),
                        xytext=(0, 2), textcoords="offset points",
                        ha="center", va="bottom", fontsize=7.5)

    ax.set_title("Median Token Count (p50) by Rendering Strategy & Overlap", fontsize=11, fontweight="bold")
    ax.set_ylabel("Median Tokens (p50)", fontsize=10)
    ax.set_xticks(x)
    ax.set_xticklabels(strat_labels, fontsize=9.5)
    ax.axhline(512, color=ACCENT_RED, linestyle="--", linewidth=1.2, label="512-Token SLA")
    ax.set_ylim(0, 550)
    ax.grid(axis="y", linestyle="--", alpha=0.7, color=GRID_COLOR)
    ax.legend(loc="upper left", fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)

    fig.tight_layout()
    fig.savefig(FIG_DIR / "ablation_strategy_and_overlap_tokens.png", dpi=200)
    fig.savefig(FIG_DIR / "ablation_strategy_and_overlap_tokens.svg")
    plt.close(fig)


def main():
    runs = load_runs()
    print(f"Loaded {len(runs)} sweep runs.")
    if not runs:
        print("No runs found in outputs directory.")
        return
    plot_ablation_truncation_vs_model_window(runs)
    plot_token_growth_by_strategy(runs)
    print(f"Figures successfully written to {FIG_DIR}")


if __name__ == "__main__":
    main()
