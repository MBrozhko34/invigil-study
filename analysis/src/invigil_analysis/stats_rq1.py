"""RQ1 (METHODOLOGY section 6.1): paired per-task pass-rate difference vs the
reference; 95% CI via task-level bootstrap (10,000 resamples); practical
threshold 3 percentage points."""
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Rq1Result:
    provider: str
    n_tasks: int
    provider_rate: float
    reference_rate: float
    gap_pp: float            # positive = provider WORSE than reference
    ci_low_pp: float
    ci_high_pp: float
    crosses_threshold: bool  # gap >= threshold AND CI excludes zero


def paired_gap(pass1: pd.DataFrame, provider: str, reference: str,
               threshold_pp: float = 3.0, n_boot: int = 10_000, seed: int = 0) -> Rq1Result:
    p = pass1[pass1["provider"] == provider].set_index("task_id")["pass1"]
    r = pass1[pass1["provider"] == reference].set_index("task_id")["pass1"]
    common = p.index.intersection(r.index)
    if len(common) < 2:
        raise ValueError(f"insufficient common tasks for {provider} vs {reference}")
    diffs = (r[common] - p[common]).to_numpy()  # positive = provider worse

    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(diffs), size=(n_boot, len(diffs)))
    boot_means = diffs[idx].mean(axis=1)
    lo, hi = np.percentile(boot_means, [2.5, 97.5])

    gap_pp = float(diffs.mean() * 100)
    lo_pp, hi_pp = float(lo * 100), float(hi * 100)
    return Rq1Result(
        provider=provider, n_tasks=int(len(common)),
        provider_rate=float(p[common].mean()), reference_rate=float(r[common].mean()),
        gap_pp=gap_pp, ci_low_pp=lo_pp, ci_high_pp=hi_pp,
        crosses_threshold=bool(gap_pp >= threshold_pp and lo_pp > 0),
    )
