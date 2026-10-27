from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

COLOR_BLUE = "#3b5ba8"
COLOR_GREEN = "#2e7d32"
COLOR_CORAL = "#e07a5f"
COLOR_PURPLE = "#6f42c1"


def compute_quantization_diagnostics(
    original: np.ndarray,
    dequantized: np.ndarray,
    q_matrix: np.ndarray,
    scales: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any]]:
    # 1. Row-wise cosine fidelity: cos(v, v_hat)
    norm_orig = np.linalg.norm(original, axis=1)
    norm_deq = np.linalg.norm(dequantized, axis=1)
    denom = np.maximum(norm_orig * norm_deq, 1e-12)
    cosine_sims = np.sum(original * dequantized, axis=1) / denom

    # 2. Reconstruction MSE
    mse = float(np.mean((original - dequantized) ** 2))

    # 3. Compression ratio: original float32 vs (int8 bytes + float32 scales)
    orig_bytes = original.size * 4
    comp_bytes = q_matrix.size * 1 + scales.size * 4
    comp_ratio = orig_bytes / max(comp_bytes, 1)

    metrics = {
        "cosine_min": float(np.min(cosine_sims)),
        "cosine_p01": float(np.percentile(cosine_sims, 1)),
        "cosine_median": float(np.median(cosine_sims)),
        "cosine_mean": float(np.mean(cosine_sims)),
        "reconstruction_mse": mse,
        "compression_ratio": float(comp_ratio),
        "scale_min": float(np.min(scales)),
        "scale_median": float(np.median(scales)),
        "scale_max": float(np.max(scales)),
        "int8_min": int(np.min(q_matrix)),
        "int8_max": int(np.max(q_matrix)),
    }

    plot_data = {
        "cosine_sims": cosine_sims,
        "scales": scales,
        "q_sample": q_matrix.ravel()[:100000] if q_matrix.size > 100000 else q_matrix.ravel(),
        "metrics": metrics,
    }
    return metrics, plot_data


def generate_quantization_plots(plot_data: dict[str, Any], out_dir: Path) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "quantization_diagnostics.png"

    fig, (ax_cos, ax_codes, ax_scales) = plt.subplots(1, 3, figsize=(16, 4.5))
    metrics = plot_data["metrics"]

    # Panel 1: Reconstruction Cosine Fidelity
    cosines = plot_data["cosine_sims"]
    ax_cos.hist(cosines, bins=40, density=True, color=COLOR_GREEN, alpha=0.6, edgecolor="white")
    ax_cos.axvline(metrics["cosine_median"], color="#1b5e20", linestyle="--", linewidth=1.8, label=f"Median: {metrics['cosine_median']:.4f}")
    ax_cos.axvline(metrics["cosine_min"], color="#d9534f", linestyle=":", linewidth=1.5, label=f"Min: {metrics['cosine_min']:.4f}")
    ax_cos.set_title("Reconstruction Cosine Fidelity", fontsize=11, fontweight="bold")
    ax_cos.set_xlabel("cos(v, v_hat)", fontsize=10)
    ax_cos.set_ylabel("Density", fontsize=10)
    ax_cos.legend(loc="upper left", fontsize=8.5, framealpha=0.9)
    ax_cos.grid(axis="y", alpha=0.3)

    # Panel 2: Integer Code Utilization (-128 to 127)
    codes = plot_data["q_sample"]
    ax_codes.hist(codes, bins=64, range=(-128, 128), density=True, color=COLOR_BLUE, alpha=0.6, edgecolor="white")
    ax_codes.axvline(0, color="#666666", linestyle=":", linewidth=1)
    ax_codes.set_title("Int8 Code Utilization", fontsize=11, fontweight="bold")
    ax_codes.set_xlabel("Quantized Integer Value", fontsize=10)
    ax_codes.set_ylabel("Density", fontsize=10)
    ax_codes.set_xlim(-130, 130)
    ax_codes.grid(axis="y", alpha=0.3)

    # Panel 3: Scale Factor Distribution
    scales = plot_data["scales"]
    ax_scales.hist(scales, bins=35, density=True, color=COLOR_CORAL, alpha=0.6, edgecolor="white")
    ax_scales.axvline(metrics["scale_median"], color="#b23c17", linestyle="--", linewidth=1.8, label=f"Median: {metrics['scale_median']:.4f}")
    ax_scales.set_title("Passage Scale Factors (s_i)", fontsize=11, fontweight="bold")
    ax_scales.set_xlabel("Max Absolute Value / 127", fontsize=10)
    ax_scales.set_ylabel("Density", fontsize=10)
    ax_scales.legend(loc="upper right", fontsize=8.5, framealpha=0.9)
    ax_scales.grid(axis="y", alpha=0.3)

    fig.suptitle(
        f"Corpus Quantization Diagnostics (Int8 Symmetric, Ratio: {metrics['compression_ratio']:.1f}x, MSE: {metrics['reconstruction_mse']:.2e})",
        fontsize=13,
        fontweight="bold",
        y=0.98,
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=200)
    plt.close(fig)

    return {"quantization_diagnostics": out_path}
