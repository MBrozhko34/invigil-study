"""Generate the reference-free consensus report from an evidence directory.

Usage:
  .venv/bin/python scripts/consensus_report.py \
      --data ../data --providers ../smoke/configs/providers \
      --out ../data/analysis/consensus.json

Quant tiers for the tier contrast come from each provider YAML's
advertised.precision; providers advertising unknown/unspecified precision are
excluded from the contrast (they still appear in all other metrics).
"""
import argparse
import json
import pathlib

import yaml

from invigil_analysis.consensus import consensus_report
from invigil_analysis.loader import greedy_texts, load_evidence


def load_tiers(providers_dir: pathlib.Path) -> dict[str, str]:
    tiers = {}
    for f in sorted(providers_dir.glob("*.yaml")):
        cfg = yaml.safe_load(f.read_text())
        precision = str(cfg.get("advertised", {}).get("precision", "unspecified"))
        if precision not in ("unknown", "unspecified"):
            tiers[cfg["id"]] = precision
    return tiers


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--providers", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    texts = greedy_texts(load_evidence(args.data))
    report = consensus_report(texts, tiers=load_tiers(pathlib.Path(args.providers)))

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))

    agg = report["provider_agreement"]
    print(f"prompts: {report['n_prompts']}  unanimous: {report['n_unanimous']}  "
          f"with-consensus: {report['n_with_consensus']}")
    for a in sorted(agg, key=lambda a: -(a["rate"] or 0)):
        print(f"  {a['provider']:<16}{a['n_match']}/{a['n_prompts']}"
              f"  ({a['rate']:.0%}, CI [{a['ci_low']:.0%}, {a['ci_high']:.0%}])")
    tc = report.get("tier_contrast")
    if tc:
        print(f"tier contrast: within={tc['within_tier_mean']}  "
              f"across={tc['across_tier_mean']}  "
              f"(pairs {tc['n_within_pairs']}/{tc['n_across_pairs']})")


if __name__ == "__main__":
    main()
