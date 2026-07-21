"""Pre-declared power check (METHODOLOGY section 6.5): simulation-based power
for the EXACT verdict rule (point estimate >= threshold AND bootstrap-CI-low
> 0, approximated here by the normal 95% CI). Gates the freeze: if power for
the assumed true effect < 0.80, increase task count / k / threshold BEFORE
freezing.

BUILD FINDING (2026-07-14): at the methodology v0.2 declared scale
(180 tasks, k=3, threshold 3pp) power is ~0.3 even against a true 6pp gap
-- the binomial variance of pass@1 dominates. Reaching >=0.80 power against
a true 6pp effect requires roughly 300 tasks at k=5 (or equivalent). This
must be resolved at Stage B calibration before freeze; see README section
"Power finding".
"""
import numpy as np


def simulate_power(task_pass_probs: np.ndarray, true_delta_pp: float, threshold_pp: float = 3.0,
                   k: int = 3, n_sims: int = 2000, seed: int = 0) -> float:
    """
    task_pass_probs: per-task reference pass probabilities (Stage B calibration).
    true_delta_pp:   assumed TRUE degradation to power against (e.g. 6pp).
    Detection = (mean paired diff >= threshold_pp) AND (95% CI excludes zero),
    mirroring stats_rq1.crosses_threshold with a normal-approx CI.
    """
    rng = np.random.default_rng(seed)
    p_ref = np.clip(task_pass_probs, 0.0, 1.0)
    p_prov = np.clip(p_ref - true_delta_pp / 100.0, 0.0, 1.0)
    n_tasks = len(p_ref)
    detected = 0
    for _ in range(n_sims):
        ref = rng.binomial(k, p_ref) / k
        prov = rng.binomial(k, p_prov) / k
        d = ref - prov
        mean = d.mean()
        se = d.std(ddof=1) / np.sqrt(n_tasks)
        ci_low = mean - 1.96 * se
        if mean * 100 >= threshold_pp and ci_low > 0:
            detected += 1
    return detected / n_sims
