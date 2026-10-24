import json
import logging
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from omegaconf import OmegaConf

from .types import Passage

logger = logging.getLogger(__name__)

LOCK_FILENAME = "config.lock.yaml"


def save_chunks_artifact(path: Path, chunks: Sequence[Passage]) -> Path:
    """Serializes Passage chunks to chunks.json using canonical Scripture coordinates."""
    path.parent.mkdir(parents=True, exist_ok=True)
    chunks_meta = [
        {
            "book": c.book,
            "start": list(c.start),
            "end": list(c.end),
            "headings": [list(h) for h in c.headings],
        }
        for c in chunks
    ]
    path.write_text(json.dumps(chunks_meta, indent=2), encoding="utf-8")
    return path


def load_chunks_artifact(path: Path) -> list[Passage]:
    """Deserializes chunks.json into a list of Passage domain objects."""
    raw_meta = json.loads(path.read_text(encoding="utf-8"))
    return [
        Passage(
            book=item["book"],
            start=(item["start"][0], item["start"][1]),
            end=(item["end"][0], item["end"][1]),
            headings=tuple((int(ch), int(v), str(h)) for ch, v, h in item.get("headings", [])),
        )
        for item in raw_meta
    ]


def _sanitize_primitives(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): _sanitize_primitives(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_primitives(v) for v in obj]
    if hasattr(obj, "item"):
        return obj.item()
    return obj


def write_lock_file(path: Path, data: dict[str, Any]) -> Path:
    """Writes a read-only (chmod 444) YAML lock file capturing artifact generation metadata."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.chmod(0o644)  # temporarily unprotect if overwriting
    content = OmegaConf.to_yaml(OmegaConf.create(_sanitize_primitives(data)))
    path.write_text(content, encoding="utf-8")
    path.chmod(0o444)  # mark read-only to prevent accidental edits
    return path


def write_inspection_samples(
    run_dir: Path,
    chunks: list[Any],
    renderer: Any,
    seed: int | None = None,
) -> list[Path]:
    """Picks a random book with at least 3 chunks and writes the first 3 chunks as read-only inspection files."""
    import random
    from collections import defaultdict

    book_chunks: dict[str, list[Any]] = defaultdict(list)
    for c in chunks:
        book_chunks[c.book].append(c)

    eligible_books = [b for b, clist in book_chunks.items() if len(clist) >= 3]
    if not eligible_books:
        eligible_books = list(book_chunks.keys())
    if not eligible_books:
        return []

    rng = random.Random(seed)
    chosen_book = rng.choice(eligible_books)
    samples = book_chunks[chosen_book][:3]

    out_paths = []
    for idx, chunk in enumerate(samples, start=1):
        rendered = renderer.render(chunk)
        path = run_dir / f"chunk_{idx}.lock.txt"
        if path.exists():
            path.chmod(0o644)
        path.write_text(rendered, encoding="utf-8")
        path.chmod(0o444)
        out_paths.append(path)
        logger.info("Inspection sample [%s chunk %d]:\n%s\n", chosen_book, idx, rendered)

    return out_paths


def read_lock_file(path: Path) -> dict[str, Any]:
    """Reads a YAML lock file returning a dictionary."""
    if not path.exists():
        raise FileNotFoundError(f"Lock file not found: {path}")
    cfg = OmegaConf.load(str(path))
    container = OmegaConf.to_container(cfg, resolve=True)
    return container if isinstance(container, dict) else {}


def resolve_matching_artifacts(
    stage_outputs_dir: Path,
    target_hash: str,
) -> Path | None:
    """Scans subdirectories in stage_outputs_dir for a config.lock.yaml with matching hash.

    Returns the newest matching run directory, or None if no match is found.
    """
    if not stage_outputs_dir.exists():
        return None

    candidates = sorted(
        [d for d in stage_outputs_dir.iterdir() if d.is_dir()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for run_dir in candidates:
        lock_path = run_dir / LOCK_FILENAME
        if not lock_path.exists():
            continue
        try:
            lock_data = read_lock_file(lock_path)
            if lock_data.get("hash") == target_hash:
                logger.info("Resolved matching artifact at %s matching hash %s", run_dir, target_hash)
                return run_dir
        except Exception as exc:
            logger.debug("Failed reading lock file %s: %s", lock_path, exc)

    logger.warning("No artifact matching hash %s found in %s", target_hash, stage_outputs_dir)
    return None
