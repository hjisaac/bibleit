import numpy as np
import pytest
from typing import Iterator

from rag_core.metrics import compute_recall_at_k, compute_reciprocal_rank
from rag_core.quantization import dequantize_int8, quantize_int8
from rag_core.rerankers import RrfReranker
from rag_core.streaming import batch_stream
from rag_core.types import GenericChunk, ScoredChunk
from rag_core.walkers import BaseWalker


def test_quantize_and_dequantize_int8() -> None:
    embeddings = np.array([
        [0.0, 0.5, -0.5, 1.0],
        [-1.0, 0.25, 0.0, -0.75],
    ], dtype=np.float32)

    q_matrix, scales = quantize_int8(embeddings)
    assert q_matrix.dtype == np.int8
    assert q_matrix.shape == embeddings.shape
    assert scales.shape == (2,)

    reconstructed = dequantize_int8(q_matrix, scales)
    assert reconstructed.shape == embeddings.shape
    assert np.allclose(embeddings, reconstructed, atol=1e-2)


def test_quantize_int8_zero_vector() -> None:
    zeros = np.zeros((1, 4), dtype=np.float32)
    q_matrix, scales = quantize_int8(zeros)
    assert np.all(q_matrix == 0)
    reconstructed = dequantize_int8(q_matrix, scales)
    assert np.allclose(zeros, reconstructed)


def test_rrf_reranker() -> None:
    c1 = GenericChunk(id="chunk-1", text="first", metadata={"val": 1})
    c2 = GenericChunk(id="chunk-2", text="second", metadata={"val": 2})
    c3 = GenericChunk(id="chunk-3", text="third", metadata={"val": 3})

    s1 = ScoredChunk(chunk=c1, score=1.0)
    s2 = ScoredChunk(chunk=c2, score=0.9)
    s3 = ScoredChunk(chunk=c3, score=0.8)

    reranker = RrfReranker[dict](k=60)
    reranked = reranker.merge_rankings([[s1, s2, s3], [s2, s1, s3]])

    assert len(reranked) == 3
    # c1 and c2 have equal rank sums: 1/61 + 1/62
    top_ids = {reranked[0].chunk.id, reranked[1].chunk.id}
    assert top_ids == {"chunk-1", "chunk-2"}
    assert reranked[2].chunk.id == "chunk-3"
    assert reranked[0].score > reranked[2].score


def test_batch_stream() -> None:
    items = list(range(10))
    batches = list(batch_stream(items, batch_size=3))
    assert batches == [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]]

    assert list(batch_stream([], batch_size=3)) == []


def test_metrics() -> None:
    retrieved = ["a", "b", "c", "d"]
    assert compute_reciprocal_rank(retrieved, "a") == 1.0
    assert compute_reciprocal_rank(retrieved, "b") == 0.5
    assert compute_reciprocal_rank(retrieved, "c") == pytest.approx(1 / 3)
    assert compute_reciprocal_rank(retrieved, "x") == 0.0

    assert compute_recall_at_k(retrieved, "a", k=1) == 1.0
    assert compute_recall_at_k(retrieved, "b", k=1) == 0.0
    assert compute_recall_at_k(retrieved, "b", k=2) == 1.0
    assert compute_recall_at_k(retrieved, "x", k=4) == 0.0


def test_base_walker_streaming() -> None:
    class SequenceWalker(BaseWalker[int]):
        def __init__(self, limit: int):
            self.limit = limit

        def walk(self) -> Iterator[int]:
            yield from range(self.limit)

    walker = SequenceWalker(5)
    assert list(walker.walk()) == [0, 1, 2, 3, 4]
