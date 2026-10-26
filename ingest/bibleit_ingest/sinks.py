import gzip
import json
import logging
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from rag_core.sinks import BaseSink

from .types import BookCorpus, Passage

logger = logging.getLogger(__name__)


class StaticArtifactSink(BaseSink):
    """Writes static PWA artifacts (manifest, verses, chunks, float32 embeddings)."""

    def __init__(
        self,
        translation: dict[str, str] | None = None,
    ):
        self.translation = translation or {
            "id": "web",
            "lang": "en",
            "name": "World English Bible",
            "license": "public domain",
        }

    def write(
        self,
        out_dir: Path,
        corpus: BookCorpus,
        chunks: Sequence[Passage],
        embeddings: np.ndarray,
        model: str,
        query_prefix: str,
        chunk_meta: dict[str, Any],
        **kwargs: Any,
    ) -> Path:
        if len(chunks) != embeddings.shape[0]:
            raise ValueError(f"{len(chunks)} chunks but {embeddings.shape[0]} embedding rows")
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # 1. Verses (compressed 2D array JSON: { [book]: string[][] })
        verses_payload = corpus.to_dict()
        verses_file = out_dir / "verses.json.gz"
        with gzip.open(verses_file, "wt", encoding="utf-8") as f:
            json.dump(verses_payload, f, separators=(",", ":"))

        # 2. Chunks (compressed coordinate spans without text)
        chunks_payload = [
            {
                "id": i,
                "book": chunk.book,
                "start": list(chunk.start),
                "end": list(chunk.end),
                "headings": [list(h) for h in chunk.headings],
            }
            for i, chunk in enumerate(chunks)
        ]
        chunks_file = out_dir / "chunks.json.gz"
        with gzip.open(chunks_file, "wt", encoding="utf-8") as f:
            json.dump(chunks_payload, f, separators=(",", ":"))

        # 3. Float32 Embeddings
        emb_file = out_dir / "embeddings.f32.bin"
        emb_file.write_bytes(embeddings.astype(np.float32).tobytes())

        # 4. Manifest
        manifest = {
            "schema_version": 3,
            "translation": self.translation,
            "corpus": {"verses": verses_file.name, "count": len(corpus.all_verses())},
            "chunks": {"file": chunks_file.name, **chunk_meta},
            "embeddings": {
                "file": emb_file.name,
                "model": model,
                "dim": int(embeddings.shape[1]),
                "query_prefix": query_prefix,
                "quantization": {"type": "float32"},
                "count": len(chunks),
            },
        }
        manifest_file = out_dir / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2))

        logger.info("Wrote static artifacts to %s", out_dir)
        return out_dir
