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
