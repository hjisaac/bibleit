from pathlib import Path
from typing import Any, Sequence

from bibleit_ingest.chunking import Passage, VerseAddress


def format_passage(chunk: Passage, ordered_verses: Sequence[tuple[VerseAddress, str]]) -> tuple[str, str]:
    """Returns (citation_header, text_body) for a passage."""
    start_v = ordered_verses[chunk.start_idx][0]
    end_v = ordered_verses[chunk.end_idx - 1][0]
    if start_v[1] == end_v[1]:
        citation = f"{chunk.book} {start_v[1]}:{start_v[2]}–{end_v[2]}"
    else:
        citation = f"{chunk.book} {start_v[1]}:{start_v[2]}–{end_v[1]}:{end_v[2]}"

    heading_part = f" — {chunk.headings[0]}" if chunk.headings else ""
    header = f"[{citation}]{heading_part}"
    text = " ".join(ordered_verses[k][1] for k in range(chunk.start_idx, chunk.end_idx))
    return header, text


def generate_retrieval_report(
    diagnostics: list[dict[str, Any]],
    chunks: Sequence[Passage],
    ordered_verses: Sequence[tuple[VerseAddress, str]],
    metrics: dict[str, float],
    out_path: Path,
) -> Path:
    total = len(diagnostics)
    misses = [d for d in diagnostics if d["target_rank"] is None]
    near_misses = [d for d in diagnostics if d["target_rank"] is not None and d["target_rank"] > 1]
    direct_hits = [d for d in diagnostics if d["target_rank"] == 1]

    lines = [
        "# Retrieval Inspection Report",
        "",
        "## Summary Metrics",
        "| Metric | Value |",
        "| :--- | :--- |",
    ]
    for k, v in metrics.items():
        lines.append(f"| **{k.upper()}** | `{v:.4f}` |")
    lines.append(f"| **Total Evaluated** | `{total}` |")
    lines.append(f"| **Direct Hits (Rank 1)** | `{len(direct_hits)} ({len(direct_hits) / max(total, 1) * 100:.1f}%)` |")
    lines.append(f"| **Near Misses (Rank 2–K)** | `{len(near_misses)} ({len(near_misses) / max(total, 1) * 100:.1f}%)` |")
    lines.append(f"| **Misses (Not in Top-K)** | `{len(misses)} ({len(misses) / max(total, 1) * 100:.1f}%)` |")
    lines.append("")

    # Section 1: Complete Misses
    lines.append(f"## ❌ Misses (Not in Top K) — {len(misses)} queries")
    lines.append("")
    if not misses:
        lines.append("*None! All queries retrieved within top-k.*")
        lines.append("")
    for d in misses:
        q_text = d["query"]
        q_id = d["id"]
        tgt_chunk = chunks[d["target_chunk_idx"]]
        tgt_hdr, tgt_txt = format_passage(tgt_chunk, ordered_verses)

        lines.append(f"### Query `{q_id}`: *\"{q_text}\"*")
        lines.append(f"- **Target**: `{tgt_hdr}` *(Not in top {len(d['matches'])})*")
        lines.append("")
        lines.append("<details open>")
        lines.append(f"<summary><b>🎯 Target Passage: {tgt_hdr}</b></summary>")
        lines.append("")
        lines.append(f"> {tgt_txt}")
        lines.append("</details>")
        lines.append("")

        for m in d["matches"][:3]:
            m_chunk = chunks[m["chunk_idx"]]
            m_hdr, m_txt = format_passage(m_chunk, ordered_verses)
            is_open = " open" if m["rank"] == 1 else ""
            lines.append(f"<details{is_open}>")
            lines.append(f"<summary><b>Rank {m['rank']} (Score: {m['score']:.4f}): {m_hdr}</b></summary>")
            lines.append("")
            lines.append(f"> {m_txt}")
            lines.append("</details>")
            lines.append("")
        lines.append("---")
        lines.append("")

    # Section 2: Near Misses
    lines.append(f"## ⚠️ Near Misses (Rank 2–K) — {len(near_misses)} queries")
    lines.append("")
    for d in near_misses:
        q_text = d["query"]
        q_id = d["id"]
        rank = d["target_rank"]
        tgt_chunk = chunks[d["target_chunk_idx"]]
        tgt_hdr, tgt_txt = format_passage(tgt_chunk, ordered_verses)

        lines.append(f"### Query `{q_id}`: *\"{q_text}\"*")
        lines.append(f"- **Target Found at Rank**: `{rank}`")
        lines.append("")
        lines.append("<details open>")
        lines.append(f"<summary><b>🎯 Target Passage [Rank {rank}]: {tgt_hdr}</b></summary>")
        lines.append("")
        lines.append(f"> {tgt_txt}")
        lines.append("</details>")
        lines.append("")

        top1 = d["matches"][0]
        t1_chunk = chunks[top1["chunk_idx"]]
        t1_hdr, t1_txt = format_passage(t1_chunk, ordered_verses)
        lines.append("<details open>")
        lines.append(f"<summary><b>1️⃣ Rank 1 Match (Score: {top1['score']:.4f}): {t1_hdr}</b></summary>")
        lines.append("")
        lines.append(f"> {t1_txt}")
        lines.append("</details>")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Section 3: Direct Hits
    lines.append(f"## ✅ Direct Hits (Rank 1) — {len(direct_hits)} queries")
    lines.append("")
    lines.append("<details>")
    lines.append(f"<summary><b>Expand {len(direct_hits)} Direct Hits</b></summary>")
    lines.append("")
    for d in direct_hits:
        q_text = d["query"]
        q_id = d["id"]
        tgt_chunk = chunks[d["target_chunk_idx"]]
        tgt_hdr, tgt_txt = format_passage(tgt_chunk, ordered_verses)
        score = d["matches"][0]["score"] if d["matches"] else 0.0

        lines.append(f"#### Query `{q_id}`: *\"{q_text}\"* (Score: `{score:.4f}`)")
        lines.append(f"- `{tgt_hdr}`: {tgt_txt[:140]}...")
        lines.append("")
    lines.append("</details>")
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines))
    return out_path
