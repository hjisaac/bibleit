from collections.abc import Mapping, Sequence
from typing import TypeVar

TDefault = TypeVar("TDefault")


def smart_getattr(
    obj: object | Mapping[str, object],
    keypath: str | Sequence[str],
    default: TDefault | None = None,
    sep: str = ".",
) -> object | TDefault | None:
    """Returns the value of the attribute or key if it exists,
    otherwise the specified default value.
    """
    keys = keypath.split(sep) if isinstance(keypath, str) else keypath

    for key in keys:
        if isinstance(obj, Mapping):
            obj = obj.get(key)
        elif hasattr(obj, key):
            obj = getattr(obj, key)
        else:
            return default

        if obj is None:
            return default
    return obj
