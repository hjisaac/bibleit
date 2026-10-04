from typing import Any

from omegaconf import OmegaConf


def sanitize_overrides(overrides: list[str] | None) -> list[str]:
    """Return normalized Hydra override strings, dropping empty values."""
    if not overrides:
        return []
    return [item.strip() for item in overrides if item and item.strip()]


def apply_overrides(base_config: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Merge overrides onto an already-loaded config dict, in memory -- no
    file reads, no Hydra compose. Used by sweeps to vary one base config
    across many points without re-resolving it from disk each time."""
    merged = OmegaConf.merge(OmegaConf.create(base_config), OmegaConf.create(overrides))
    return OmegaConf.to_container(merged, resolve=True)
