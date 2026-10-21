import gzip
import json
from pathlib import Path

import numpy as np

from bibleit_ingest.sinks import StaticArtifactSink
from bibleit_ingest.types import BookCorpus, Passage
from rag_core.embedders import BaseEmbedder


class MockEmbedder(BaseEmbedder):
    @property
    def model_name(self) -> str:
        return "test-embedder-v1"

    @property
    def dim(self) -> int:
        return 4

    def embed_query(self, text: str) -> np.ndarray:
        return np.zeros(4, dtype=np.float32)

    def embed_documents(self, texts, batch_size=32):
        for _ in texts:
            yield np.zeros(4, dtype=np.float32)


def test_static_artifact_sink(tmp_path: Path) -> None:
    corpus = BookCorpus({
        "GEN": {
            1: {
                1: "In the beginning",
                2: "The earth was formless",
            }
        }
    })
    chunks = [
        Passage(
            book="GEN",
            start=(1, 1),
            end=(1, 2),
            headings=((1, 1, "Creation"),),
        )
    ]
    embeddings = np.array([[0.5, -0.5, 0.25, 1.0]], dtype=np.float32)
    embedder = MockEmbedder()

    sink = StaticArtifactSink()
    sink.write(
        out_dir=tmp_path,
        corpus=corpus,
        chunks=chunks,
        embeddings=embeddings,
        embedder=embedder,
        strategy_meta={"strategy": "adaptive_window", "floor": 2, "ceiling": 10},
    )

    manifest_path = tmp_path / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert manifest["schema_version"] == 3
    assert manifest["translation"]["id"] == "web"
    assert manifest["corpus"]["count"] == 2
    assert manifest["embeddings"]["model"] == "test-embedder-v1"
    assert manifest["embeddings"]["dim"] == 4
    assert manifest["embeddings"]["count"] == 1
    assert manifest["embeddings"]["quantization"]["type"] == "int8"

    # Verify verses.json.gz (dense/sparse array schema)
    verses_path = tmp_path / "verses.json.gz"
    assert verses_path.exists()
    with gzip.open(verses_path, "rt", encoding="utf-8") as f:
        verses_data = json.load(f)
    assert "GEN" in verses_data
    assert verses_data["GEN"][0][0] == "In the beginning"
    assert verses_data["GEN"][0][1] == "The earth was formless"

    # Verify chunks.json.gz (zero-text coordinate spans)
    chunks_path = tmp_path / "chunks.json.gz"
    assert chunks_path.exists()
    with gzip.open(chunks_path, "rt", encoding="utf-8") as f:
        chunks_data = json.load(f)
    assert len(chunks_data) == 1
    assert chunks_data[0]["book"] == "GEN"
    assert chunks_data[0]["start"] == [1, 1]
    assert chunks_data[0]["end"] == [1, 2]
    assert chunks_data[0]["headings"] == [[1, 1, "Creation"]]
    assert "text" not in chunks_data[0]

    # Verify binary embeddings and scales
    emb_path = tmp_path / "embeddings.i8.bin"
    scales_path = tmp_path / "scales.f32.bin"
    assert emb_path.exists()
    assert scales_path.exists()
    q_data = np.frombuffer(emb_path.read_bytes(), dtype=np.int8)
    assert len(q_data) == 4
