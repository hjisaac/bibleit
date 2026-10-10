from abc import ABC, abstractmethod
from typing import Any

import numpy as np


def quantize_int8(matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Symmetric per-row int8 quantization.
    Returns (quantized_int8_matrix, row_scales_float32)."""
    scales = (np.max(np.abs(matrix), axis=1) / 127.0).astype(np.float32)
    scales[scales == 0] = 1.0
    quantized = np.clip(np.round(matrix / scales[:, None]), -128, 127).astype(np.int8)
    return quantized, scales


def dequantize_int8(quantized: np.ndarray, scales: np.ndarray) -> np.ndarray:
    """Dequantizes int8 matrix back to float32 using row scales."""
    return (quantized.astype(np.float32) * scales[:, None]).astype(np.float32)


class BaseQuantizer(ABC):
    """Abstract base class for vector quantization strategies."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def quantize(self, matrix: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """Compresses matrix, returning quantized array and auxiliary metadata."""
        ...

    @abstractmethod
    def dequantize(self, quantized: np.ndarray, **meta: Any) -> np.ndarray:
        """Decompresses quantized array back to float32 using metadata."""
        ...


class Int8Quantizer(BaseQuantizer):
    """Symmetric per-row int8 quantization."""

    @property
    def name(self) -> str:
        return "int8"

    def quantize(self, matrix: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        q, scales = quantize_int8(matrix)
        return q, {"scales": scales}

    def dequantize(self, quantized: np.ndarray, **meta: Any) -> np.ndarray:
        scales = meta.get("scales")
        if scales is None:
            raise ValueError("Int8 dequantization requires 'scales'")
        return dequantize_int8(quantized, scales)


class NoOpQuantizer(BaseQuantizer):
    """Pass-through quantizer retaining full float32 precision."""

    @property
    def name(self) -> str:
        return "float32"

    def quantize(self, matrix: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        return matrix, {}

    def dequantize(self, quantized: np.ndarray, **meta: Any) -> np.ndarray:
        return quantized
