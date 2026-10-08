from typing import Iterable, Iterator, TypeVar

T = TypeVar("T")


def batch_stream(items: Iterable[T], batch_size: int = 32) -> Iterator[list[T]]:
    """Yields batches of size `batch_size` from an iterable."""
    batch: list[T] = []
    for item in items:
        batch.append(item)
        if len(batch) == batch_size:
            yield batch
            batch = []
    if batch:
        yield batch
