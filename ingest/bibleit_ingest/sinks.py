import gzip
import hashlib
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
        scales: np.ndarray | None = None,
        **kwargs: Any,
    ) -> Path:
        if len(chunks) != embeddings.shape[0]:
            raise ValueError(f"{len(chunks)} chunks but {embeddings.shape[0]} embedding rows")
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # 1. Verses (hash uncompressed JSON payload; store deterministic mtime=0 gzip)
        verses_raw = json.dumps(corpus.to_dict(), separators=(",", ":")).encode("utf-8")
        verses_bytes = gzip.compress(verses_raw, mtime=0)
        verses_file = out_dir / "verses.json.gz"
        verses_file.write_bytes(verses_bytes)

        # 2. Chunks (hash uncompressed JSON payload; store deterministic mtime=0 gzip)
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
        chunks_raw = json.dumps(chunks_payload, separators=(",", ":")).encode("utf-8")
        chunks_bytes = gzip.compress(chunks_raw, mtime=0)
        chunks_file = out_dir / "chunks.json.gz"
        chunks_file.write_bytes(chunks_bytes)

        # 3. Embeddings (int8 + scales or float32)
        if embeddings.dtype == np.int8 or scales is not None:
            emb_bytes = embeddings.astype(np.int8).tobytes()
            emb_file = out_dir / "embeddings.i8.bin"
            emb_file.write_bytes(emb_bytes)
            scales_bytes = scales.astype(np.float32).tobytes() if scales is not None else b""
            scales_file = out_dir / "scales.f32.bin"
            scales_file.write_bytes(scales_bytes)
            quant_meta = {
                "type": "int8",
                "scales": scales_file.name,
                "scales_sha256": hashlib.sha256(scales_bytes).hexdigest(),
            }
        else:
            emb_bytes = embeddings.astype(np.float32).tobytes()
            emb_file = out_dir / "embeddings.f32.bin"
            emb_file.write_bytes(emb_bytes)
            quant_meta = {"type": "float32"}

        # 4. Manifest with cryptographic SHA-256 integrity checksums over canonical payloads
        manifest = {
            "schema_version": 3,
            "translation": self.translation,
            "corpus": {
                "verses": verses_file.name,
                "count": len(corpus.all_verses()),
                "sha256": hashlib.sha256(verses_raw).hexdigest(),
            },
            "chunks": {
                "file": chunks_file.name,
                "sha256": hashlib.sha256(chunks_raw).hexdigest(),
                **chunk_meta,
            },
            "embeddings": {
                "file": emb_file.name,
                "model": model,
                "dim": int(embeddings.shape[1]),
                "query_prefix": query_prefix,
                "quantization": quant_meta,
                "count": len(chunks),
                "sha256": hashlib.sha256(emb_bytes).hexdigest(),
            },
        }
        manifest_file = out_dir / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2))

        logger.info("Wrote static artifacts to %s", out_dir)
        return out_dir
