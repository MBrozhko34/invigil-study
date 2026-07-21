"""Pre-declared verdict assignment (METHODOLOGY section 6). The categories are
exhaustive and mechanical -- verdicts follow from thresholds, never judgment:

  CONSISTENT | DIVERGENT_QUALITY | DIVERGENT_DISTRIBUTION | TEMPLATE_CONFOUNDED
  | CONSISTENT_WITH_ADVERTISED_QUANTIZATION | INSUFFICIENT_DATA
"""
from dataclasses import dataclass, asdict

from .stats_rq1 import Rq1Result
from .stats_rq2 import Rq2Result

CATEGORIES = [
    "CONSISTENT",
    "DIVERGENT_QUALITY",
    "DIVERGENT_DISTRIBUTION",
    "TEMPLATE_CONFOUNDED",
    "CONSISTENT_WITH_ADVERTISED_QUANTIZATION",
    "INSUFFICIENT_DATA",
]


@dataclass
class Verdict:
    provider: str
    category: str
    rq1_gap_pp: float | None
    rq1_ci: tuple[float, float] | None
    rq2_p: float | None
    rq2_effect: float | None
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)


def assign_verdict(
    provider: str,
    rq1: Rq1Result | None,
    rq2: Rq2Result | None,
    rq2_reject_after_holm: bool,
    failure_rate: float,
    advertised_precision: str,
    matches_advertised_quant_profile: bool = False,
    template_confounded: bool = False,
) -> Verdict:
    base = dict(
        provider=provider,
        rq1_gap_pp=rq1.gap_pp if rq1 else None,
        rq1_ci=(rq1.ci_low_pp, rq1.ci_high_pp) if rq1 else None,
        rq2_p=rq2.p_value if rq2 else None,
        rq2_effect=rq2.rank_biserial if rq2 else None,
    )

    if failure_rate > 0.10 or rq1 is None:
        return Verdict(**base, category="INSUFFICIENT_DATA",
                       notes=f"failure rate {failure_rate:.1%} exceeds 10% budget" if failure_rate > 0.10 else "missing probe data")

    if template_confounded:
        return Verdict(**base, category="TEMPLATE_CONFOUNDED",
                       notes="divergence plausibly attributable to chat-template differences (METHODOLOGY section 4)")

    distributional = rq2 is not None and rq2.crosses_threshold and rq2_reject_after_holm

    # Disclosed quantization served faithfully is HONEST (METHODOLOGY section 6).
    if advertised_precision not in ("bf16", "fp16", "unspecified") and matches_advertised_quant_profile:
        return Verdict(**base, category="CONSISTENT_WITH_ADVERTISED_QUANTIZATION",
                       notes=f"advertises {advertised_precision}; profile matches the corresponding secondary reference")

    if rq1.crosses_threshold and distributional:
        return Verdict(**base, category="DIVERGENT_QUALITY",
                       notes=f"functional gap {rq1.gap_pp:.1f}pp (CI [{rq1.ci_low_pp:.1f},{rq1.ci_high_pp:.1f}]) with distributional corroboration")

    if distributional:
        return Verdict(**base, category="DIVERGENT_DISTRIBUTION",
                       notes="distributional divergence beyond noise floor; functional gap not established -- NOT reported as quality degradation")

    return Verdict(**base, category="CONSISTENT", notes="no pre-declared threshold crossed")
