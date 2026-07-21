"""Greedy-divergence metrics (METHODOLOGY section 5.2).
Comparisons are CHARACTER-level, deliberately: provider tokenizers are not
observable, so tokens are not a comparable unit across endpoints. Char-level
first-divergence + capped Levenshtein are tokenizer-agnostic and pre-declared.
"""
import numpy as np

CAP = 1024  # compare at most this many characters (cost bound, pre-declared)


def first_divergence_index(a: str, b: str) -> int:
    a, b = a[:CAP], b[:CAP]
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    if len(a) != len(b):
        return n
    return CAP  # identical within cap -> maximal agreement score


def levenshtein_capped(a: str, b: str, cap: int = CAP) -> int:
    a, b = a[:cap], b[:cap]
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = np.arange(len(b) + 1)
    for i, ca in enumerate(a, 1):
        cur = np.empty(len(b) + 1, dtype=np.int64)
        cur[0] = i
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return int(prev[-1])
