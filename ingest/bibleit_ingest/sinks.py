import gzip
import json
import logging
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from rag_core.embedders import BaseEmbedder
from rag_core.quantization import BaseQuantizer, Int8Quantizer
from rag_core.sinks import BaseSink

from .renderers import BasePassageRenderer, HeadingAndTextRenderer
from .types import Passage, PreparedCorpus

logger = logging.getLogger(__name__)


class StaticArtifactSink(BaseSink):
    """Writes static PWA artifacts (manifest, verses, chunks, embeddings)."""

    def __init__(
        self,
        translation: dict[str, str] | None = None,
        quantizer: BaseQuantizer | None = None,
        renderer: BasePassageRenderer | None = None,
    ):
        self.translation = translation or {
            "id": "web",
            "lang": "en",
            "name": "World English Bible",
            "license": "public domain",
        }
        self.quantizer = quantizer or Int8Quantizer()
        self.renderer = renderer

    def write(
        self,
        out_dir: Path,
        corpus: PreparedCorpus,
        chunks: Sequence[Passage],
        embeddings: np.ndarray,
        embedder: BaseEmbedder,
        strategy_meta: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> Path:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        meta = strategy_meta or {"strategy": "adaptive_window"}

        # 1. Verses (compressed JSON)
        verses_payload = [
            {"book": addr[0], "chapter": addr[1], "verse": addr[2], "text": text}
            for addr, text in corpus.ordered_verses
        ]
        verses_file = out_dir / "verses.json.gz"
        with gzip.open(verses_file, "wt", encoding="utf-8") as f:
            json.dump(verses_payload, f, separators=(",", ":"))

        # 2. Chunks (compressed JSON)
        renderer = self.renderer or HeadingAndTextRenderer(
            corpus.ordered_verses, corpus.address_index
        )
        chunks_payload = []
        for i, chunk in enumerate(chunks):
            start_addr = chunk.start_address or corpus.ordered_verses[chunk.start_idx][0]
            end_addr = chunk.end_address or corpus.ordered_verses[chunk.end_idx - 1][0]
            chunks_payload.append(
                {
                    "id": i,
                    "start": {"book": start_addr[0], "chapter": start_addr[1], "verse": start_addr[2]},
                    "end": {"book": end_addr[0], "chapter": end_addr[1], "verse": end_addr[2]},
                    "text": renderer.render(chunk),
                }
            )
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

        # 4. Manifest
        manifest = {
            "schema_version": 1,
            "translation": self.translation,
            "corpus": {"verses": verses_file.name, "count": len(corpus.ordered_verses)},
            "chunks": {"file": chunks_file.name, **meta},
            "embeddings": {
                "file": emb_file.name,
                "model": embedder.model_id,
                "dim": embedder.dim,
                "quantization": quant_dict,
                "count": len(chunks),
            },
        }
        manifest_file = out_dir / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2))

        logger.info("Published static artifacts to %s", out_dir)
        return out_dir
