"""Run-to-run self-consistency: each provider's agreement with ITSELF across
two replicate runs of the same greedy prompts. The reference-free noise floor
for cross-provider consensus claims.

Usage:
  .venv/bin/python scripts/self_consistency.py \
      --run-a ../data --run-b ../data-rep2 \
      --out ../data/analysis/self-consistency.json
"""
import argparse
import json
import pathlib

from invigil_analysis.consensus import self_agreement
from invigil_analysis.loader import greedy_texts, load_evidence


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-a", required=True)
    ap.add_argument("--run-b", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    texts_a = greedy_texts(load_evidence(args.run_a))
    texts_b = greedy_texts(load_evidence(args.run_b))
    agg = self_agreement(texts_a, texts_b)

    report = {"run_a": args.run_a, "run_b": args.run_b,
              "self_agreement": [a.to_dict() for a in agg]}
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))

    print("run-to-run self-agreement (same provider, same prompt, two runs):")
    for a in sorted(agg, key=lambda a: -(a.rate or 0)):
        print(f"  {a.provider:<16}{a.n_match}/{a.n_prompts}"
              f"  ({a.rate:.0%}, CI [{a.ci_low:.0%}, {a.ci_high:.0%}])")


if __name__ == "__main__":
    main()
