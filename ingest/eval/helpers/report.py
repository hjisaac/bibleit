from collections.abc import Callable, Sequence
from enum import Enum
from pathlib import Path
from typing import Any

import snakemd

from bibleit_ingest.chunking import Passage, VerseAddress

ChunkRenderer = Callable[[int], tuple[str, str]]


class RetrievalOutcome(str, Enum):
    HIT = "hit"
    NEAR_MISS = "near_miss"
    MISS = "miss"


KEYCAPS = {1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣", 10: "🔟"}


def format_rank_label(rank: int) -> str:
    prefix = f"{KEYCAPS[rank]} " if rank <= 10 else ""
    return f"{prefix}Rank {rank}"


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


class DetailsBlock(snakemd.Block):
    """Collapsible details block element for SnakeMD documents."""

    def __init__(self, summary: str, body: str, is_open: bool = False) -> None:
        super().__init__()
        self.summary = summary
        self.body = body
        self.is_open = is_open

    def __str__(self) -> str:
        open_attr = " open" if self.is_open else ""
        return f"<details{open_attr}>\n<summary><b>{self.summary}</b></summary>\n\n> {self.body}\n</details>"

    def __repr__(self) -> str:
        return f"DetailsBlock(summary={self.summary!r}, is_open={self.is_open})"


class BaseRetrievalReport:
    """Base retrieval inspection report generator powered by SnakeMD."""

    def __init__(
        self,
        diagnostics: list[dict[str, Any]],
        metrics: dict[str, float],
        renderer: ChunkRenderer | None = None,
        hit_cutoff: int = 1,
    ) -> None:
        self.diagnostics = diagnostics
        self.metrics = metrics
        self.renderer = renderer
        self.hit_cutoff = hit_cutoff

    def render_item(self, idx: int) -> tuple[str, str]:
        """Returns (header, text_body) for a chunk index."""
        if self.renderer is not None:
            return self.renderer(idx)
        raise NotImplementedError("Subclasses must implement render_item or supply renderer callback.")

    def classify_outcome(self, target_rank: int | None) -> RetrievalOutcome:
        """Classifies retrieval outcome based on configured target rank cutoff."""
        if target_rank is None:
            return RetrievalOutcome.MISS
        return RetrievalOutcome.HIT if target_rank <= self.hit_cutoff else RetrievalOutcome.NEAR_MISS

    def generate(self, out_path: Path) -> Path:
        doc = snakemd.new_doc()

        buckets: dict[RetrievalOutcome, list[dict[str, Any]]] = {
            RetrievalOutcome.HIT: [],
            RetrievalOutcome.NEAR_MISS: [],
            RetrievalOutcome.MISS: [],
        }
        for d in self.diagnostics:
            buckets[self.classify_outcome(d.get("target_rank"))].append(d)

        self._render_summary(doc, buckets)
        self._render_misses(doc, buckets[RetrievalOutcome.MISS])
        self._render_near_misses(doc, buckets[RetrievalOutcome.NEAR_MISS])
        self._render_direct_hits(doc, buckets[RetrievalOutcome.HIT])

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(str(doc))
        return out_path

    # Protected renderer methods for document structure

    def _render_summary(self, doc: snakemd.Document, buckets: dict[RetrievalOutcome, list[dict[str, Any]]]) -> None:
        # Formats the top-level benchmark scorecard and outcome breakdown table.
        total = len(self.diagnostics)
        hits = buckets[RetrievalOutcome.HIT]
        near = buckets[RetrievalOutcome.NEAR_MISS]
        misses = buckets[RetrievalOutcome.MISS]

        doc.add_heading("Retrieval Inspection Report", level=1)
        doc.add_heading("Summary Metrics", level=2)
        rows = [[f"**{k.upper()}**", f"`{v:.4f}`"] for k, v in self.metrics.items()]
        rows.append(["**Total Evaluated**", f"`{total}`"])
        rows.append(["**Direct Hits**", f"`{len(hits)} ({len(hits) / max(total, 1) * 100:.1f}%)`"])
        rows.append(["**Near Misses**", f"`{len(near)} ({len(near) / max(total, 1) * 100:.1f}%)`"])
        rows.append(["**Misses**", f"`{len(misses)} ({len(misses) / max(total, 1) * 100:.1f}%)`"])
        doc.add_table(["Metric", "Value"], rows)

    def _render_misses(self, doc: snakemd.Document, items: list[dict[str, Any]]) -> None:
        # Renders queries where the target failed to appear anywhere in top-k.
        doc.add_heading(f"❌ Misses (Not in Top K) — {len(items)} queries", level=2)
        if not items:
            doc.add_paragraph("*None! All queries retrieved within top-k.*")
            return

        for d in items:
            tgt_hdr, tgt_txt = self.render_item(d["target_chunk_idx"])
            doc.add_heading(f"Query `{d['id']}`: *\"{d['query']}\"*", level=3)
            doc.add_paragraph(f"- **Target**: `{tgt_hdr}` *(Not in top {len(d.get('matches', []))})*")

            doc.add_block(DetailsBlock(summary=f"🎯 Target: {tgt_hdr}", body=tgt_txt, is_open=True))

            for m in d.get("matches", []):
                m_hdr, m_txt = self.render_item(m["chunk_idx"])
                label = f"{format_rank_label(m['rank'])} (Score: {m['score']:.4f}): {m_hdr}"
                doc.add_block(DetailsBlock(summary=label, body=m_txt, is_open=(m["rank"] == 1)))
            doc.add_horizontal_rule()

    def _render_near_misses(self, doc: snakemd.Document, items: list[dict[str, Any]]) -> None:
        # Renders queries where the target was retrieved, but outranked below the hit cutoff.
        doc.add_heading(f"⚠️ Near Misses (Rank {self.hit_cutoff + 1}–K) — {len(items)} queries", level=2)
        if not items:
            doc.add_paragraph("*None!*")
            return

        for d in items:
            rank = d["target_rank"]
            tgt_hdr, tgt_txt = self.render_item(d["target_chunk_idx"])
            doc.add_heading(f"Query `{d['id']}`: *\"{d['query']}\"*", level=3)
            doc.add_paragraph(f"- **Target Found at Rank**: `{rank}`")

            doc.add_block(DetailsBlock(summary=f"🎯 Target [Rank {rank}]: {tgt_hdr}", body=tgt_txt, is_open=True))

            for m in d.get("matches", []):
                m_hdr, m_txt = self.render_item(m["chunk_idx"])
                is_target = m["chunk_idx"] == d["target_chunk_idx"]
                tag = "🎯 [TARGET] " if is_target else ""
                label = f"{tag}{format_rank_label(m['rank'])} (Score: {m['score']:.4f}): {m_hdr}"
                doc.add_block(DetailsBlock(summary=label, body=m_txt, is_open=(m["rank"] == 1 or is_target)))
            doc.add_horizontal_rule()

    def _render_direct_hits(self, doc: snakemd.Document, items: list[dict[str, Any]]) -> None:
        # Renders queries where the target successfully ranked within the hit cutoff.
        doc.add_heading(f"✅ Direct Hits (Rank 1–{self.hit_cutoff}) — {len(items)} queries", level=2)
        if not items:
            doc.add_paragraph("*None!*")
            return

        hits_lines = []
        for d in items:
            tgt_hdr, tgt_txt = self.render_item(d["target_chunk_idx"])
            matches = d.get("matches", [])
            score = matches[0]["score"] if matches else 0.0
            hits_lines.append(f"#### Query `{d['id']}`: *\"{d['query']}\"* (Score: `{score:.4f}`)")
            hits_lines.append(f"- `{tgt_hdr}`: {tgt_txt[:140]}...\n")

        doc.add_raw(f"<details>\n<summary><b>Expand {len(items)} Direct Hits</b></summary>\n\n" + "\n".join(hits_lines) + "\n</details>")


def generate_retrieval_report(
    diagnostics: list[dict[str, Any]],
    renderer: ChunkRenderer,
    metrics: dict[str, float],
    out_path: Path,
    hit_cutoff: int = 1,
) -> Path:
    """Convenience function to generate a retrieval inspection report."""
    return BaseRetrievalReport(
        diagnostics=diagnostics,
        metrics=metrics,
        renderer=renderer,
        hit_cutoff=hit_cutoff,
    ).generate(out_path)
