import json
from pathlib import Path

import matplotlib.pyplot as plt

SCRIPT_DIR = Path(__file__).resolve().parent
FIG_DIR = SCRIPT_DIR / "figures"
FIG_DIR.mkdir(exist_ok=True)

OT_COLOR = "#3B5BA8"
NT_COLOR = "#B8792E"
MISS_COLOR = "#B3403B"

data = json.load(open(SCRIPT_DIR / "pericope_sizes.json"))
book_order = data["book_order"]
per_book = data["per_book"]
MISS_BOOK = "ROM"


def plot_headings_per_book():
    names = [per_book[b]["book_name"] for b in book_order]
    counts = [per_book[b]["heading_count"] for b in book_order]
    testaments = [per_book[b]["testament"] for b in book_order]
    colors = [
        MISS_COLOR if b == MISS_BOOK else (OT_COLOR if t == "OT" else NT_COLOR)
        for b, t in zip(book_order, testaments)
    ]

    fig, ax = plt.subplots(figsize=(16, 5))
    ax.bar(range(len(book_order)), counts, color=colors, width=0.85)
    ax.set_xticks(range(len(book_order)))
    ax.set_xticklabels(book_order, rotation=90, fontsize=6.5)
    ax.set_ylabel("pericopes (headings)")
    ax.set_title("BSB pericope headings per book, canonical order (Genesis → Revelation)")

    otn = sum(1 for t in testaments if t == "OT")
    ax.axvline(otn - 0.5, color="#888888", linestyle="--", linewidth=1)

    from matplotlib.patches import Patch
    ax.legend(handles=[
        Patch(color=OT_COLOR, label="Old Testament"),
        Patch(color=NT_COLOR, label="New Testament"),
        Patch(color=MISS_COLOR, label="contains the miss (Romans)"),
    ], loc="upper right", fontsize=9)

    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(FIG_DIR / "headings_per_book.png", dpi=200)
    fig.savefig(FIG_DIR / "headings_per_book.svg")
    plt.close(fig)


def plot_size_distribution():
    sizes = [p["verse_count"] for p in data["pericopes"]]
    bins = list(range(1, 40)) + [100000]  # 1 to 38 individually, then an overflow bin.
    fig, ax = plt.subplots(figsize=(10, 5))
    counts, edges, patches = ax.hist(
        sizes, bins=bins, color=OT_COLOR, edgecolor="white", linewidth=0.3,
    )
    # Highlight the <=3 verse tail.
    for i, patch in enumerate(patches):
        if edges[i] <= 3:
            patch.set_facecolor(MISS_COLOR)

    ax.axvline(sum(sizes) / len(sizes), color="#333333", linestyle="--", linewidth=1, label=f"mean = {sum(sizes)/len(sizes):.1f}")
    median = sorted(sizes)[len(sizes)//2]
    ax.axvline(median, color="#333333", linestyle=":", linewidth=1, label=f"median = {median}")

    ax.set_xlim(0, 40)
    ax.set_xlabel("verses per pericope")
    ax.set_ylabel("pericope count")
    ax.set_title("Pericope size distribution (n=3,015)")
    ax.legend(fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(FIG_DIR / "pericope_size_distribution.png", dpi=200)
    fig.savefig(FIG_DIR / "pericope_size_distribution.svg")
    plt.close(fig)


if __name__ == "__main__":
    plot_headings_per_book()
    plot_size_distribution()
    print(f"figures written to {FIG_DIR}")
    for f in sorted(FIG_DIR.iterdir()):
        print(" ", f.name)
