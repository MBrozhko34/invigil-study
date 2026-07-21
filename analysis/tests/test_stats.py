"""Every statistical function validated against reference values, plus a
synthetic dataset with KNOWN planted degradation that must yield the correct
verdict end-to-end (the reputationally-critical test)."""
import numpy as np
import pandas as pd
import pytest
from scipy.stats import mannwhitneyu

from invigil_analysis.divergence import first_divergence_index, levenshtein_capped
from invigil_analysis.holm import holm_bonferroni
from invigil_analysis.noise_floor import divergence_distribution
from invigil_analysis.power import simulate_power
from invigil_analysis.stats_rq1 import paired_gap
from invigil_analysis.stats_rq2 import greedy_vs_noise, tv_distance
from invigil_analysis.verdicts import assign_verdict


# ---------- divergence ----------

def test_first_divergence():
    assert first_divergence_index("abcdef", "abcxef") == 3
    assert first_divergence_index("abc", "abc") == 1024  # identical -> cap
    assert first_divergence_index("abc", "abcd") == 3    # prefix
    assert first_divergence_index("", "x") == 0


def test_levenshtein_reference_values():
    assert levenshtein_capped("kitten", "sitting") == 3   # classic
    assert levenshtein_capped("flaw", "lawn") == 2
    assert levenshtein_capped("", "abc") == 3
    assert levenshtein_capped("same", "same") == 0


# ---------- RQ1 bootstrap ----------

def _rates(provider_probs: dict[str, list[float]]) -> pd.DataFrame:
    rows = []
    for prov, probs in provider_probs.items():
        for i, p in enumerate(probs):
            rows.append({"provider": prov, "task_id": f"t{i:03d}", "pass1": p})
    return pd.DataFrame(rows)


def test_rq1_detects_planted_gap():
    rng = np.random.default_rng(7)
    n = 180
    ref = rng.uniform(0.35, 0.85, n)
    degraded = np.clip(ref - 0.08, 0, 1)           # planted 8pp gap
    rates = _rates({"ref": list(ref), "prov": list(degraded)})
    r = paired_gap(rates, "prov", "ref", threshold_pp=3.0, seed=1)
    assert r.crosses_threshold
    assert 6.0 < r.gap_pp < 10.0
    assert r.ci_low_pp > 3.0


def test_rq1_no_gap_no_flag():
    rng = np.random.default_rng(8)
    ref = rng.uniform(0.4, 0.8, 180)
    same = np.clip(ref + rng.normal(0, 0.01, 180), 0, 1)  # noise only
    rates = _rates({"ref": list(ref), "prov": list(same)})
    r = paired_gap(rates, "prov", "ref", seed=1)
    assert not r.crosses_threshold


# ---------- RQ2 Mann-Whitney ----------

def test_rq2_matches_scipy_and_effect_size():
    rng = np.random.default_rng(9)
    prov = pd.Series(rng.integers(5, 60, 300).astype(float), name="prov")   # early divergence
    noise = pd.Series(rng.integers(200, 900, 300).astype(float), name="noise")
    r = greedy_vs_noise(prov, noise, alpha=0.01)
    u, p = mannwhitneyu(prov.to_numpy(), noise.to_numpy(), alternative="less")
    assert r.u_stat == pytest.approx(u)
    assert r.p_value == pytest.approx(p)
    assert r.rank_biserial == pytest.approx(1 - 2 * u / (300 * 300))
    assert r.crosses_threshold
    assert r.rank_biserial > 0.9  # near-total separation


def test_rq2_identical_distributions_not_flagged():
    rng = np.random.default_rng(10)
    base = rng.integers(100, 900, 300).astype(float)
    r = greedy_vs_noise(pd.Series(base, name="a"), pd.Series(rng.permutation(base), name="b"))
    assert not r.crosses_threshold


def test_tv_distance():
    a = [{"token": "x", "logprob": str(np.log(0.7))}, {"token": "y", "logprob": str(np.log(0.3))}]
    b = [{"token": "x", "logprob": str(np.log(0.3))}, {"token": "y", "logprob": str(np.log(0.7))}]
    assert tv_distance(a, b) == pytest.approx(0.4, abs=1e-9)
    assert tv_distance(a, a) == pytest.approx(0.0, abs=1e-12)


# ---------- Holm ----------

def test_holm_reference_example():
    # Classic worked example: m=4, alpha=0.05
    p = {"a": 0.01, "b": 0.04, "c": 0.03, "d": 0.005}
    rej = holm_bonferroni(p, alpha=0.05)
    assert rej == {"d": True, "a": True, "c": False, "b": False}


def test_holm_all_null():
    rej = holm_bonferroni({"a": 0.5, "b": 0.9}, alpha=0.01)
    assert rej == {"a": False, "b": False}


# ---------- power ----------

def test_power_gate_fails_at_v02_scale():
    """BUILD FINDING: methodology v0.2's 180 tasks x k=3 is UNDERPOWERED --
    the Stage B gate correctly refuses this configuration even against a
    generous true 6pp gap. Resolution required before freeze (see README)."""
    rng = np.random.default_rng(11)
    probs = rng.uniform(0.35, 0.85, 180)
    power = simulate_power(probs, true_delta_pp=6.0, threshold_pp=3.0, k=3, n_sims=500, seed=2)
    assert power < 0.80


def test_power_adequate_at_recommended_scale():
    """300 tasks x k=5 clears the 80% gate against a true 6pp gap -- the
    recommended v0.3 configuration."""
    rng = np.random.default_rng(11)
    probs = rng.uniform(0.35, 0.85, 300)
    power = simulate_power(probs, true_delta_pp=6.0, threshold_pp=3.0, k=5, n_sims=500, seed=2)
    assert power >= 0.80


def test_power_collapses_with_tiny_n():
    rng = np.random.default_rng(12)
    probs = rng.uniform(0.35, 0.85, 10)
    power = simulate_power(probs, true_delta_pp=6.0, threshold_pp=3.0, k=3, n_sims=500, seed=2)
    assert power < 0.5


# ---------- end-to-end verdict on planted degradation ----------

def _mk_texts(rng, providers_shift: dict[str, int], n_prompts=120) -> pd.DataFrame:
    """Reference pair agrees for ~600 chars; shifted providers diverge early."""
    rows = []
    base_texts = ["".join(rng.choice(list("abcdefgh"), 900)) for _ in range(n_prompts)]
    for prov, shift in providers_shift.items():
        for i, bt in enumerate(base_texts):
            if shift == 0:
                # agree with reference until a late random point (noise floor)
                cut = int(rng.integers(500, 890))
            else:
                cut = int(rng.integers(5, shift))
            text = bt[:cut] + "".join(rng.choice(list("zyxwv"), 900 - cut))
            rows.append({"provider": prov, "prompt_id": f"p{i:03d}", "text": text})
    for i, bt in enumerate(base_texts):  # the reference itself
        rows.append({"provider": "ref-a", "prompt_id": f"p{i:03d}", "text": bt})
    return pd.DataFrame(rows)


def test_planted_degradation_yields_divergent_quality_verdict():
    rng = np.random.default_rng(13)
    texts = _mk_texts(rng, {"ref-b": 0, "bad-prov": 60, "good-prov": 0})
    noise = divergence_distribution(texts, "ref-a", "ref-b")

    n = 180
    ref_rates = rng.uniform(0.4, 0.8, n)
    rates = _rates({
        "ref-a": list(ref_rates),
        "bad-prov": list(np.clip(ref_rates - 0.07, 0, 1)),   # planted 7pp functional gap
        "good-prov": list(ref_rates),
    })

    rq2_bad = greedy_vs_noise(divergence_distribution(texts, "bad-prov", "ref-a"), noise)
    rq2_good = greedy_vs_noise(divergence_distribution(texts, "good-prov", "ref-a"), noise)
    holm = holm_bonferroni({"bad-prov": rq2_bad.p_value, "good-prov": rq2_good.p_value})

    v_bad = assign_verdict(
        "bad-prov", paired_gap(rates, "bad-prov", "ref-a", seed=3), rq2_bad,
        holm["bad-prov"], failure_rate=0.01, advertised_precision="bf16",
    )
    v_good = assign_verdict(
        "good-prov", paired_gap(rates, "good-prov", "ref-a", seed=3), rq2_good,
        holm["good-prov"], failure_rate=0.01, advertised_precision="bf16",
    )
    assert v_bad.category == "DIVERGENT_QUALITY"
    assert v_good.category == "CONSISTENT"


def test_disclosed_quantization_is_honest():
    rng = np.random.default_rng(14)
    texts = _mk_texts(rng, {"ref-b": 0, "fp8-prov": 60})
    noise = divergence_distribution(texts, "ref-a", "ref-b")
    rq2 = greedy_vs_noise(divergence_distribution(texts, "fp8-prov", "ref-a"), noise)
    n = 180
    ref_rates = rng.uniform(0.4, 0.8, n)
    rates = _rates({"ref-a": list(ref_rates), "fp8-prov": list(np.clip(ref_rates - 0.05, 0, 1))})
    v = assign_verdict(
        "fp8-prov", paired_gap(rates, "fp8-prov", "ref-a", seed=4), rq2,
        rq2_reject_after_holm=True, failure_rate=0.0,
        advertised_precision="fp8", matches_advertised_quant_profile=True,
    )
    assert v.category == "CONSISTENT_WITH_ADVERTISED_QUANTIZATION"


def test_high_failure_rate_is_insufficient_data():
    v = assign_verdict("flaky", None, None, False, failure_rate=0.25, advertised_precision="bf16")
    assert v.category == "INSUFFICIENT_DATA"
