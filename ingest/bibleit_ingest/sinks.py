import gzip
import json
import logging
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from rag_core.embedders import BaseEmbedder
from rag_core.quantization import BaseQuantizer, Int8Quantizer
from rag_core.sinks import BaseSink

from .types import BookCorpus, Passage

logger = logging.getLogger(__name__)


class StaticArtifactSink(BaseSink):
    """Writes static PWA artifacts (manifest, verses, chunks, embeddings)."""

    def __init__(
        self,
        translation: dict[str, str] | None = None,
        quantizer: BaseQuantizer | None = None,
    ):
        self.translation = translation or {
            "id": "web",
            "lang": "en",
            "name": "World English Bible",
            "license": "public domain",
        }
        self.quantizer = quantizer or Int8Quantizer()

    def write(
        self,
        out_dir: Path,
        corpus: BookCorpus,
        chunks: Sequence[Passage],
        embeddings: np.ndarray,
        embedder: BaseEmbedder,
        strategy_meta: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> Path:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        meta = strategy_meta or {"strategy": "adaptive_window"}

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

        # 3. Quantized Embeddings & Scales
        q_matrix, quant_meta = self.quantizer.quantize(embeddings)
        ext = "i8.bin" if self.quantizer.name == "int8" else f"{self.quantizer.name}.bin"
        emb_file = out_dir / f"embeddings.{ext}"
        emb_file.write_bytes(q_matrix.tobytes())

        quant_dict: dict[str, Any] = {"type": self.quantizer.name}
        if "scales" in quant_meta:
            scales_file = out_dir / "scales.f32.bin"
            scales_file.write_bytes(quant_meta["scales"].tobytes())
            quant_dict["scales"] = scales_file.name

        # 4. Manifest (Schema Version 3)
        manifest = {
            "schema_version": 3,
            "translation": self.translation,
            "corpus": {"verses": verses_file.name, "count": len(corpus.all_verses())},
            "chunks": {"file": chunks_file.name, **meta},
            "embeddings": {
                "file": emb_file.name,
                "model": (
                    getattr(embedder.raw_model, "model_name", None)
                    if hasattr(embedder, "raw_model")
                    else getattr(embedder, "model_name", "unknown")
                ),
                "dim": embedder.dim,
                "quantization": quant_dict,
                "count": len(chunks),
            },
        }
        manifest_file = out_dir / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2))

        logger.info("Wrote static artifacts to %s", out_dir)
        return out_dir
