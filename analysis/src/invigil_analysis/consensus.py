"""Cross-provider consensus metrics (reference-free view).

These metrics need NO self-hosted reference and therefore support only
cross-provider claims ("providers disagree"), never absolute quality verdicts
(METHODOLOGY section 6 boundary -- enforced by keeping this module separate
from verdicts.py).

Mechanical rules, pre-declared:
- A prompt has a CONSENSUS text iff a unique plurality exists with count >= 2.
  Prompts where every provider differs, or where the plurality is tied, have
  no consensus and are excluded from agreement denominators.
- Agreement is exact-text (byte) equality; divergence depth reuses the
  char-level first_divergence_index from divergence.py (tokenizer-agnostic).
- Intervals are 95% Wilson score intervals.
"""
from collections import Counter
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd
from scipy.stats import norm

from .divergence import first_divergence_index, CAP


def wilson_interval(k: int, n: int, confidence: float = 0.95) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    z = float(norm.ppf(0.5 + confidence / 2))
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


@dataclass
class PromptConsensus:
    prompt_id: str
    n_providers: int
    n_variants: int
    consensus_size: int      # 0 when no unique plurality with count >= 2
    has_consensus: bool
    unanimous: bool

    def to_dict(self) -> dict:
        return asdict(self)


def consensus_text(texts_for_prompt: dict[str, str]) -> str | None:
    """Unique plurality with count >= 2, else None."""
    counts = Counter(texts_for_prompt.values()).most_common()
    if not counts or counts[0][1] < 2:
        return None
    if len(counts) > 1 and counts[1][1] == counts[0][1]:
        return None
    return counts[0][0]


def by_prompt(texts: pd.DataFrame) -> list[PromptConsensus]:
    out = []
    for pid, g in texts.groupby("prompt_id"):
        m = dict(zip(g["provider"], g["text"]))
        cons = consensus_text(m)
        variants = len(set(m.values()))
        out.append(PromptConsensus(
            prompt_id=str(pid), n_providers=len(m), n_variants=variants,
            consensus_size=Counter(m.values())[cons] if cons is not None else 0,
            has_consensus=cons is not None,
            unanimous=variants == 1 and len(m) > 1,
        ))
    return out


@dataclass
class ProviderAgreement:
    provider: str
    n_prompts: int           # prompts answered where a consensus existed
    n_match: int
    rate: float
    ci_low: float
    ci_high: float

    def to_dict(self) -> dict:
        return asdict(self)


def provider_agreement(texts: pd.DataFrame) -> list[ProviderAgreement]:
    match: Counter = Counter()
    total: Counter = Counter()
    for _, g in texts.groupby("prompt_id"):
        m = dict(zip(g["provider"], g["text"]))
        cons = consensus_text(m)
        if cons is None:
            continue
        for prov, t in m.items():
            total[prov] += 1
            if t == cons:
                match[prov] += 1
    out = []
    for prov in sorted(set(texts["provider"])):
        n, k = total[prov], match[prov]
        lo, hi = wilson_interval(k, n)
        out.append(ProviderAgreement(provider=prov, n_prompts=n, n_match=k,
                                     rate=k / n if n else float("nan"),
                                     ci_low=lo, ci_high=hi))
    return out


def self_agreement(texts_a: pd.DataFrame, texts_b: pd.DataFrame) -> list[ProviderAgreement]:
    """Per-provider exact-match rate between two replicate runs of the SAME
    prompts (run-to-run self-consistency). This is the reference-free noise
    floor for consensus metrics: a provider's disagreement with others is only
    meaningful relative to its agreement with itself."""
    a = {(r.provider, r.prompt_id): r.text for r in texts_a.itertuples()}
    b = {(r.provider, r.prompt_id): r.text for r in texts_b.itertuples()}
    out = []
    for prov in sorted({p for p, _ in a} | {p for p, _ in b}):
        common = [pid for (p, pid) in a if p == prov and (prov, pid) in b]
        n = len(common)
        k = sum(a[(prov, pid)] == b[(prov, pid)] for pid in common)
        lo, hi = wilson_interval(k, n)
        out.append(ProviderAgreement(provider=prov, n_prompts=n, n_match=k,
                                     rate=k / n if n else float("nan"),
                                     ci_low=lo, ci_high=hi))
    return out


def pairwise_matrix(texts: pd.DataFrame, metric: str = "exact") -> pd.DataFrame:
    """Symmetric provider x provider matrix over common prompts.

    metric="exact":     fraction of common prompts with byte-identical text
    metric="divergence": mean first-divergence char index (CAP = identical)
    """
    providers = sorted(set(texts["provider"]))
    per = {p: dict(zip(g["prompt_id"], g["text"]))
           for p, g in texts.groupby("provider")}
    mat = pd.DataFrame(index=providers, columns=providers, dtype=float)
    for a in providers:
        for b in providers:
            common = set(per[a]) & set(per[b])
            if not common:
                mat.loc[a, b] = float("nan")
                continue
            if metric == "exact":
                vals = [float(per[a][pid] == per[b][pid]) for pid in common]
            elif metric == "divergence":
                vals = [float(first_divergence_index(per[a][pid], per[b][pid]))
                        for pid in common]
            else:
                raise ValueError(f"unknown metric {metric!r}")
            mat.loc[a, b] = float(np.mean(vals))
    return mat


def tier_contrast(exact: pd.DataFrame, tiers: dict[str, str]) -> dict:
    """Mean pairwise exact-agreement within advertised quant tiers vs across
    them. Descriptive only (n of pairs is tiny at smoke scale)."""
    within, across = [], []
    provs = [p for p in exact.index if p in tiers]
    for i, a in enumerate(provs):
        for b in provs[i + 1:]:
            v = exact.loc[a, b]
            if pd.isna(v):
                continue
            (within if tiers[a] == tiers[b] else across).append(float(v))
    return {
        "within_tier_mean": float(np.mean(within)) if within else None,
        "across_tier_mean": float(np.mean(across)) if across else None,
        "n_within_pairs": len(within),
        "n_across_pairs": len(across),
    }


def consensus_report(texts: pd.DataFrame, tiers: dict[str, str] | None = None) -> dict:
    prompts = by_prompt(texts)
    exact = pairwise_matrix(texts, "exact")
    div = pairwise_matrix(texts, "divergence")
    report = {
        "n_prompts": len(prompts),
        "n_unanimous": sum(p.unanimous for p in prompts),
        "n_with_consensus": sum(p.has_consensus for p in prompts),
        "prompts": [p.to_dict() for p in prompts],
        "provider_agreement": [a.to_dict() for a in provider_agreement(texts)],
        "pairwise_exact": exact.round(4).to_dict(),
        "pairwise_mean_divergence_char": div.round(1).to_dict(),
        "divergence_cap_chars": CAP,
    }
    if tiers:
        report["tier_contrast"] = tier_contrast(exact, tiers)
    return report
