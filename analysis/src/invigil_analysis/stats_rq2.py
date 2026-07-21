"""RQ2 (METHODOLOGY sections 6.2-6.3): distributional divergence vs the noise
floor. Mann-Whitney U with rank-biserial effect size for greedy divergence;
mean total-variation distance for logprobs."""
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu


@dataclass
class Rq2Result:
    provider: str
    n: int
    median_divergence: float
    noise_median: float
    u_stat: float
    p_value: float
    rank_biserial: float      # positive = provider diverges EARLIER than noise floor
    crosses_threshold: bool   # median < 50% of noise median AND p < alpha


def greedy_vs_noise(provider_div: pd.Series, noise_div: pd.Series,
                    alpha: float = 0.01) -> Rq2Result:
    x = provider_div.to_numpy(dtype=float)   # provider-vs-reference first-divergence indices
    y = noise_div.to_numpy(dtype=float)      # reference-vs-reference (noise floor)
    # H1: provider diverges EARLIER (stochastically smaller divergence index)
    u, p = mannwhitneyu(x, y, alternative="less")
    rb = 1.0 - 2.0 * u / (len(x) * len(y))   # rank-biserial in [-1, 1]
    med_x, med_y = float(np.median(x)), float(np.median(y))
    return Rq2Result(
        provider=str(provider_div.name), n=len(x),
        median_divergence=med_x, noise_median=med_y,
        u_stat=float(u), p_value=float(p), rank_biserial=float(rb),
        crosses_threshold=bool(med_x < 0.5 * med_y and p < alpha),
    )


def tv_distance(p_top: list[dict], q_top: list[dict]) -> float:
    """Total-variation distance between two top-k logprob vectors (as prob mass)."""
    def mass(top: list[dict]) -> dict[str, float]:
        return {t["token"]: float(np.exp(float(t["logprob"]))) for t in top}
    pm, qm = mass(p_top), mass(q_top)
    tokens = set(pm) | set(qm)
    return 0.5 * sum(abs(pm.get(t, 0.0) - qm.get(t, 0.0)) for t in tokens)


def mean_tv(provider_lp: pd.DataFrame, reference_lp: pd.DataFrame) -> pd.Series:
    """Per-prompt TV distance between provider and reference FIRST-token top-5."""
    p = provider_lp.set_index("prompt_id")["logprobs"]
    r = reference_lp.set_index("prompt_id")["logprobs"]
    common = p.index.intersection(r.index)
    out = {}
    for pid in common:
        pl, rl = p[pid], r[pid]
        if isinstance(pl, list) and isinstance(rl, list) and pl and rl:
            out[pid] = tv_distance(pl[0]["top"], rl[0]["top"])
    return pd.Series(out, name="tv")
