"""Offline pipeline seams: source -> chunk -> embed -> quantize -> artifacts.

Each stage is a small ABC; a new translation or embedding model is a new
adapter plus a CLI flag. The output must conform to the artifact contract in
design/architecture.md (mirrored by app/src/core/types.ts).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np


@dataclass(frozen=True)
class Verse:
    book: str  # stable USFM-style id, e.g. "JHN"
    chapter: int
    verse: int
    text: str


@dataclass(frozen=True)
class Chunk:
    id: int
    verses: Sequence[Verse]  # consecutive; start/end derived at serialization

    @property
    def text(self) -> str:
        return " ".join(v.text for v in self.verses)


@dataclass(frozen=True)
class TranslationMeta:
    id: str        # "web", "lsg"
    lang: str      # "en", "fr"
    name: str      # "World English Bible"
    license: str   # "public domain"


class TextSource(ABC):
    """Yields the corpus for one translation.

    v1: local JSON files. Swap: api.bible client for licensed translations
    (those artifacts must never be committed/bundled).
    """

    @property
    @abstractmethod
    def meta(self) -> TranslationMeta: ...

    @abstractmethod
    def verses(self) -> Iterable[Verse]: ...


class Chunker(ABC):
    """Groups verses into retrieval passages.

    v1: sliding window (window=7, overlap=2), never crossing book boundaries.
    Swap: pericope-based chunking from a headings dataset.
    """

    @abstractmethod
    def chunk(self, verses: Sequence[Verse]) -> list[Chunk]: ...


class Embedder(ABC):
    """Embeds chunk texts. model_id/dim are written into the manifest, and the
    PWA's QueryEmbedder must match them exactly — that is the whole contract.

    v1: sentence-transformers all-MiniLM-L6-v2 (384d). Swap: any model that
    also has an ONNX/transformers.js build for the browser side.
    """

    @property
    @abstractmethod
    def model_id(self) -> str: ...

    @property
    @abstractmethod
    def dim(self) -> int: ...

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> np.ndarray:  # (n, dim) float32
        ...


class Quantizer(ABC):
    """Compresses the embedding matrix for shipping.

    v1: per-vector symmetric int8 (+ scales file). Swap: float16, binary(+rerank).
    Returns (data_bytes, aux_files) where aux_files maps filename -> bytes,
    and the manifest fragment describing itself.
    """

    @abstractmethod
    def quantize(
        self, matrix: np.ndarray
    ) -> tuple[bytes, dict[str, bytes], dict]: ...
