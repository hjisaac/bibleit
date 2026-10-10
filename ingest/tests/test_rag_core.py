import numpy as np
import pytest
from typing import Iterator

from rag_core.metrics import evaluate_retrieval
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


def test_evaluate_retrieval() -> None:
    qrels = {"q1": {"doc1": 1}}
    run = {"q1": {"doc1": 0.9, "doc2": 0.5}}

    metrics = evaluate_retrieval(qrels, run, metrics=["mrr", "recall@1", "ndcg@5"])
    assert metrics["mrr"] == 1.0
    assert metrics["recall@1"] == 1.0


def test_base_walker_streaming() -> None:
    class SequenceWalker(BaseWalker[int]):
        def __init__(self, limit: int):
            self.limit = limit

        def lazy_walk(self) -> Iterator[int]:
            yield from range(self.limit)

    walker = SequenceWalker(5)
    assert list(walker.lazy_walk()) == [0, 1, 2, 3, 4]
    assert walker.walk() == [0, 1, 2, 3, 4]


def test_base_embedder() -> None:
    from rag_core.embedders import BaseEmbedder

    class DummyEmbedder(BaseEmbedder):
        @property
        def model_id(self) -> str:
            return "dummy-model"

        @property
        def dim(self) -> int:
            return 3

        def embed_query(self, text: str) -> np.ndarray:
            return np.array([1.0, 0.0, 0.0], dtype=np.float32)

        def embed_documents(
            self, texts: list[str], batch_size: int = 32
        ) -> Iterator[np.ndarray]:
            for _ in texts:
                yield np.array([0.0, 1.0, 0.0], dtype=np.float32)

    embedder = DummyEmbedder()
    assert embedder.model_id == "dummy-model"
    assert embedder.dim == 3

    q_vec = embedder.embed_query("search")
    assert np.allclose(q_vec, [1.0, 0.0, 0.0])

    queries_vecs = list(embedder.embed_queries(["q1", "q2"]))
    assert len(queries_vecs) == 2
    assert np.allclose(queries_vecs[0], [1.0, 0.0, 0.0])

    doc_matrix = embedder.embed(["d1", "d2"])
    assert doc_matrix.shape == (2, 3)
    assert np.allclose(doc_matrix[0], [0.0, 1.0, 0.0])


def test_quantizer_classes() -> None:
    from rag_core.quantization import Int8Quantizer, NoOpQuantizer

    matrix = np.array([
        [1.0, -1.0, 0.5],
        [0.0, 0.25, -0.75],
    ], dtype=np.float32)

    # Int8Quantizer
    i8_q = Int8Quantizer()
    assert i8_q.name == "int8"
    q_mat, meta = i8_q.quantize(matrix)
    assert q_mat.dtype == np.int8
    assert "scales" in meta
    reconstructed = i8_q.dequantize(q_mat, **meta)
    assert np.allclose(matrix, reconstructed, atol=1e-2)

    # NoOpQuantizer
    noop = NoOpQuantizer()
    assert noop.name == "float32"
    pass_mat, noop_meta = noop.quantize(matrix)
    assert pass_mat.dtype == np.float32
    assert np.allclose(matrix, pass_mat)
    assert np.allclose(matrix, noop.dequantize(pass_mat, **noop_meta))
