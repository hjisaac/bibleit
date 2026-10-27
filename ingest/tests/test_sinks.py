import gzip
import json
from pathlib import Path

import numpy as np

from bibleit_ingest.sinks import StaticArtifactSink
from bibleit_ingest.types import BookCorpus, Passage


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

    sink = StaticArtifactSink()
    sink.write(
        out_dir=tmp_path,
        corpus=corpus,
        chunks=chunks,
        embeddings=embeddings,
        model="test-embedder-v1",
        query_prefix="search_query: ",
        chunk_meta={"strategy": "adaptive_window", "floor": 2, "ceiling": 10},
    )

    manifest_path = tmp_path / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert manifest["schema_version"] == 3
    assert manifest["translation"]["id"] == "web"
    assert manifest["corpus"]["count"] == 2
    assert manifest["chunks"]["ceiling"] == 10
    assert manifest["embeddings"]["model"] == "test-embedder-v1"
    assert manifest["embeddings"]["dim"] == 4
    assert manifest["embeddings"]["count"] == 1
    assert manifest["embeddings"]["query_prefix"] == "search_query: "
    assert manifest["embeddings"]["quantization"]["type"] == "float32"
    assert "sha256" in manifest["corpus"] and len(manifest["corpus"]["sha256"]) == 64
    assert "sha256" in manifest["chunks"] and len(manifest["chunks"]["sha256"]) == 64
    assert "sha256" in manifest["embeddings"] and len(manifest["embeddings"]["sha256"]) == 64

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

    # Verify binary float32 embeddings
    emb_path = tmp_path / "embeddings.f32.bin"
    assert emb_path.exists()
    f_data = np.frombuffer(emb_path.read_bytes(), dtype=np.float32)
    assert len(f_data) == 4
    np.testing.assert_allclose(f_data, embeddings[0], atol=1e-6)


def test_static_artifact_sink_int8(tmp_path: Path) -> None:
    corpus = BookCorpus({"GEN": {1: {1: "In the beginning"}}})
    chunks = [Passage(book="GEN", start=(1, 1), end=(1, 1))]
    i8_embeddings = np.array([[10, -20, 30, 40]], dtype=np.int8)
    scales = np.array([0.01], dtype=np.float32)

    sink = StaticArtifactSink()
    sink.write(
        out_dir=tmp_path,
        corpus=corpus,
        chunks=chunks,
        embeddings=i8_embeddings,
        scales=scales,
        model="nomic-ai/nomic-embed-text-v1.5",
        query_prefix="search_query: ",
        chunk_meta={"strategy": "token_window", "ceiling": 512, "overlap": 0},
    )

    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["embeddings"]["quantization"]["type"] == "int8"
    assert manifest["embeddings"]["quantization"]["scales"] == "scales.f32.bin"
    assert "scales_sha256" in manifest["embeddings"]["quantization"]
    assert (tmp_path / "embeddings.i8.bin").exists()
    assert (tmp_path / "scales.f32.bin").exists()
    assert len((tmp_path / "embeddings.i8.bin").read_bytes()) == 4
    assert len((tmp_path / "scales.f32.bin").read_bytes()) == 4
