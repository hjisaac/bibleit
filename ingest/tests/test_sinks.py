import gzip
import json
from pathlib import Path

import numpy as np

from bibleit_ingest.sinks import StaticArtifactSink
from bibleit_ingest.types import Passage, PreparedCorpus
from rag_core.embedders import BaseEmbedder


class MockEmbedder(BaseEmbedder):
    @property
    def model_id(self) -> str:
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
    ordered_verses = [
        (("GEN", 1, 1), "In the beginning"),
        (("GEN", 1, 2), "The earth was formless"),
    ]
    address_index = {("GEN", 1, 1): 0, ("GEN", 1, 2): 1}
    corpus = PreparedCorpus(
        pericopes=[],
        ordered_verses=ordered_verses,
        address_index=address_index,
    )
    chunks = [
        Passage(
            book="GEN",
            start_idx=0,
            end_idx=2,
            headings=("Creation",),
            start_address=("GEN", 1, 1),
            end_address=("GEN", 1, 2),
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
    assert manifest["schema_version"] == 1
    assert manifest["translation"]["id"] == "web"
    assert manifest["corpus"]["count"] == 2
    assert manifest["embeddings"]["model"] == "test-embedder-v1"
    assert manifest["embeddings"]["dim"] == 4
    assert manifest["embeddings"]["count"] == 1
    assert manifest["embeddings"]["quantization"]["type"] == "int8"

    # Verify verses.json.gz
    verses_path = tmp_path / "verses.json.gz"
    assert verses_path.exists()
    with gzip.open(verses_path, "rt", encoding="utf-8") as f:
        verses_data = json.load(f)
    assert len(verses_data) == 2
    assert verses_data[0]["book"] == "GEN"
    assert verses_data[0]["text"] == "In the beginning"

    # Verify chunks.json.gz
    chunks_path = tmp_path / "chunks.json.gz"
    assert chunks_path.exists()
    with gzip.open(chunks_path, "rt", encoding="utf-8") as f:
        chunks_data = json.load(f)
    assert len(chunks_data) == 1
    assert chunks_data[0]["start"] == {"book": "GEN", "chapter": 1, "verse": 1}
    assert chunks_data[0]["end"] == {"book": "GEN", "chapter": 1, "verse": 2}
    assert "In the beginning" in chunks_data[0]["text"]

    # Verify binary embeddings and scales
    emb_path = tmp_path / "embeddings.i8.bin"
    scales_path = tmp_path / "scales.f32.bin"
    assert emb_path.exists()
    assert scales_path.exists()
    q_data = np.frombuffer(emb_path.read_bytes(), dtype=np.int8)
    assert len(q_data) == 4
