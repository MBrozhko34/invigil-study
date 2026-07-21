"""Canonical JSON writer -- byte-compatible with packages/core/src/canonicalJson.ts.

Contract: sorted keys, no whitespace, ensure_ascii=False, and NO floats --
integers, strings, bools, None, lists, dicts only. The TS verifier round-trips
every line; any drift between the two implementations fails verification loudly.
"""
import json
from typing import Any


def _check(v: Any, path: str = "$") -> None:
    if v is None or isinstance(v, (str, bool)):
        return
    if isinstance(v, int):
        if abs(v) > 2**53 - 1:
            raise ValueError(f"canonical JSON: unsafe integer at {path}: {v}")
        return
    if isinstance(v, float):
        raise ValueError(f"canonical JSON: float forbidden at {path}: {v} (use decimal strings)")
    if isinstance(v, list):
        for i, x in enumerate(v):
            _check(x, f"{path}[{i}]")
        return
    if isinstance(v, dict):
        for k, x in v.items():
            if not isinstance(k, str):
                raise ValueError(f"canonical JSON: non-string key at {path}: {k!r}")
            _check(x, f"{path}.{k}")
        return
    raise ValueError(f"canonical JSON: unsupported type at {path}: {type(v).__name__}")


def canonicalize(v: Any) -> str:
    _check(v)
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
