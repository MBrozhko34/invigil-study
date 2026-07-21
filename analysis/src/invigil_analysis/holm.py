"""Holm-Bonferroni correction across providers within a probe family
(METHODOLOGY section 6.4)."""


def holm_bonferroni(p_values: dict[str, float], alpha: float = 0.01) -> dict[str, bool]:
    """Returns {key: reject_null} under Holm's step-down procedure."""
    items = sorted(p_values.items(), key=lambda kv: kv[1])
    m = len(items)
    reject: dict[str, bool] = {}
    stopped = False
    for i, (k, p) in enumerate(items):
        if not stopped and p <= alpha / (m - i):
            reject[k] = True
        else:
            stopped = True
            reject[k] = False
    return reject
