"""Consensus metrics validated against planted synthetic data: a known
diverger must show the lowest agreement, tie/no-plurality prompts must be
excluded mechanically, and matrices must be symmetric."""
import numpy as np
import pandas as pd

from invigil_analysis.consensus import (
    by_prompt,
    consensus_report,
    consensus_text,
    pairwise_matrix,
    provider_agreement,
    tier_contrast,
    wilson_interval,
)


def _texts(rows):
    return pd.DataFrame(rows, columns=["provider", "prompt_id", "text"])


# ---------- consensus rule ----------

def test_consensus_unique_plurality():
    assert consensus_text({"a": "x", "b": "x", "c": "y"}) == "x"


def test_no_consensus_all_distinct():
    assert consensus_text({"a": "x", "b": "y", "c": "z"}) is None


def test_no_consensus_tied_plurality():
    assert consensus_text({"a": "x", "b": "x", "c": "y", "d": "y"}) is None


# ---------- planted diverger ----------

def _planted():
    """p1..p3 agree on every prompt; bad diverges on 8 of 10."""
    rows = []
    for i in range(10):
        pid = f"g-{i:03d}"
        for prov in ("p1", "p2", "p3"):
            rows.append((prov, pid, f"answer-{i}"))
        rows.append(("bad", pid, f"answer-{i}" if i < 2 else f"WRONG-{i}"))
    return _texts(rows)


def test_planted_diverger_has_lowest_agreement():
    agg = {a.provider: a for a in provider_agreement(_planted())}
    assert agg["bad"].n_match == 2 and agg["bad"].n_prompts == 10
    for p in ("p1", "p2", "p3"):
        assert agg[p].rate == 1.0
    assert agg["bad"].rate < min(agg[p].rate for p in ("p1", "p2", "p3"))
    assert agg["bad"].ci_low < agg["bad"].rate < agg["bad"].ci_high


def test_by_prompt_counts():
    prompts = {p.prompt_id: p for p in by_prompt(_planted())}
    assert prompts["g-000"].unanimous and prompts["g-000"].n_variants == 1
    assert not prompts["g-005"].unanimous and prompts["g-005"].n_variants == 2
    assert prompts["g-005"].has_consensus and prompts["g-005"].consensus_size == 3


# ---------- matrices ----------

def test_pairwise_exact_symmetric_with_unit_diagonal():
    m = pairwise_matrix(_planted(), "exact")
    assert np.allclose(m.values, m.values.T)
    assert np.allclose(np.diag(m.values), 1.0)
    assert m.loc["p1", "p2"] == 1.0
    assert m.loc["p1", "bad"] == 0.2


def test_pairwise_divergence_identical_hits_cap():
    m = pairwise_matrix(_texts([("a", "p", "same"), ("b", "p", "same")]),
                        "divergence")
    assert m.loc["a", "b"] == 1024.0


def test_tier_contrast_within_vs_across():
    exact = pairwise_matrix(_planted(), "exact")
    tc = tier_contrast(exact, {"p1": "fp4", "p2": "fp4", "p3": "fp8", "bad": "fp8"})
    assert tc["n_within_pairs"] == 2 and tc["n_across_pairs"] == 4
    assert tc["within_tier_mean"] == (1.0 + 0.2) / 2


# ---------- self-agreement across replicate runs ----------

def test_self_agreement_planted():
    from invigil_analysis.consensus import self_agreement
    run_a = _texts([("stable", f"g-{i}", f"t-{i}") for i in range(10)]
                   + [("noisy", f"g-{i}", f"t-{i}") for i in range(10)])
    run_b = _texts([("stable", f"g-{i}", f"t-{i}") for i in range(10)]
                   + [("noisy", f"g-{i}", f"t-{i}" if i < 4 else f"X-{i}")
                      for i in range(10)])
    agg = {a.provider: a for a in self_agreement(run_a, run_b)}
    assert agg["stable"].rate == 1.0 and agg["stable"].n_prompts == 10
    assert agg["noisy"].n_match == 4 and agg["noisy"].rate == 0.4
    assert agg["noisy"].ci_low < 0.4 < agg["noisy"].ci_high


# ---------- wilson ----------

def test_wilson_reference_value():
    lo, hi = wilson_interval(8, 10)
    assert 0.49 < lo < 0.50 and 0.94 < hi < 0.95   # classic 8/10 Wilson bounds
    assert wilson_interval(0, 0) == (0.0, 1.0)


# ---------- report ----------

def test_report_end_to_end():
    rep = consensus_report(_planted(), tiers={"p1": "fp4", "p2": "fp4",
                                              "p3": "fp8", "bad": "fp8"})
    assert rep["n_prompts"] == 10
    assert rep["n_unanimous"] == 2
    assert rep["n_with_consensus"] == 10
    assert rep["tier_contrast"]["n_within_pairs"] == 2
