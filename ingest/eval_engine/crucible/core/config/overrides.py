def sanitize_overrides(overrides: list[str] | None) -> list[str]:
    """Return normalized Hydra override strings, dropping empty values."""
    if not overrides:
        return []
    return [item.strip() for item in overrides if item and item.strip()]
