from collections import defaultdict
from typing import Sequence, TypeVar

from ..types import GenericChunk, ScoredChunk
from .base import BaseReranker

TMeta = TypeVar("TMeta")


class RrfReranker(BaseReranker[TMeta]):
    """Reciprocal Rank Fusion reranker merging multiple ranked candidate lists."""

    def __init__(self, k_rrf: int = 60, k: int | None = None):
        self.k_rrf = k if k is not None else k_rrf

    def rerank(
        self,
        query: str,
        candidates: Sequence[ScoredChunk[TMeta]],
        top_k: int = 10,
    ) -> list[ScoredChunk[TMeta]]:
        sorted_candidates = sorted(candidates, key=lambda c: c.score, reverse=True)
        return list(sorted_candidates[:top_k])

    def merge_rankings(
        self,
        rankings: Sequence[Sequence[ScoredChunk[TMeta]]],
        top_k: int = 10,
    ) -> list[ScoredChunk[TMeta]]:
        """Merges multiple ranked lists via standard RRF formula score = sum(1 / (k + rank))."""
        scores: dict[int | str, float] = defaultdict(float)
        chunks: dict[int | str, GenericChunk[TMeta]] = {}

        for rank_list in rankings:
            for rank_idx, scored in enumerate(rank_list, start=1):
                chunk_id = scored.chunk.id
                chunks[chunk_id] = scored.chunk
                scores[chunk_id] += 1.0 / (self.k_rrf + rank_idx)

        sorted_ids = sorted(scores.keys(), key=lambda cid: scores[cid], reverse=True)
        return [
            ScoredChunk(chunk=chunks[cid], score=scores[cid], source="hybrid_rrf")
            for cid in sorted_ids[:top_k]
        ]
