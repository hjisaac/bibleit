from pathlib import Path
import numpy as np

from analysis.quantize_corpus.plots import (
    compute_quantization_diagnostics,
    generate_quantization_plots,
)
from rag_core.quantization import Int8Quantizer


def test_quantization_diagnostics_and_plots(tmp_path: Path) -> None:
    rng = np.random.default_rng(seed=42)
    original = rng.normal(size=(50, 64)).astype(np.float32)
    norms = np.linalg.norm(original, axis=1, keepdims=True)
    unit = original / norms

    quantizer = Int8Quantizer()
    q_matrix, quant_meta = quantizer.quantize(unit)
    dequantized = quantizer.dequantize(q_matrix, **quant_meta)

    metrics, plot_data = compute_quantization_diagnostics(
        unit, dequantized, q_matrix, quant_meta["scales"]
    )

    assert metrics["cosine_median"] > 0.99
    assert metrics["compression_ratio"] > 3.0
    assert metrics["int8_min"] >= -128
    assert metrics["int8_max"] <= 127

    plot_paths = generate_quantization_plots(plot_data, tmp_path)
    assert plot_paths["quantization_diagnostics"].exists()
