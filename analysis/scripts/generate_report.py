"""Auto-generate the latest results report (markdown) from evidence dirs.

Machine-generated numbers only; interpretation lives in docs/SMOKE-RESULTS.md.
Run via scripts/report.sh (or directly):

  .venv/bin/python scripts/generate_report.py \
      --clean ../data --replicate ../data-rep2 \
      --defaults ../data-run1-provider-defaults \
      --providers ../smoke/configs/providers --out ../docs/results/latest.md
"""
import argparse
import json
import pathlib

import pandas as pd

from invigil_analysis.consensus import consensus_report, self_agreement
from invigil_analysis.loader import (bench_frame, context_frame, greedy_texts,
                                     load_evidence)


def md_table(rows: list[list], header: list[str]) -> str:
    out = ["| " + " | ".join(header) + " |",
           "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def hygiene(df: pd.DataFrame) -> dict:
    gen = df[df["kind"] == "generation"]
    return {
        "units": len(gen),
        "ok": int((gen["response_status"] == "ok").sum()),
        "errors": int((gen["response_status"] == "error").sum()),
        "na_capability": int((gen["response_status"] == "na_capability").sum()),
        "models": sorted(gen.loc[gen["response_status"] == "ok", "model_reported"].unique()),
    }


def bench_by_provider(df: pd.DataFrame) -> dict[str, str]:
    ex = df[df["kind"] == "execution"]
    return {p: f"{int(g['passed'].sum())}/{int(g['total'].sum())}"
            for p, g in ex.groupby("provider")}


def context_by_provider(df: pd.DataFrame) -> dict[str, str]:
    ctx = context_frame(df)
    ok = ctx[ctx["response_status"] == "ok"]
    return {p: f"{int(g['retrieved'].sum())}/{len(g)}" for p, g in ok.groupby("provider")}


def roots_line(data_dir: pathlib.Path) -> str:
    f = data_dir / "roots.json"
    if not f.exists():
        return "not merkleized"
    roots = json.loads(f.read_text())
    return "; ".join(f"{d}: `{v['root']}` ({v['count']} leaves)" for d, v in sorted(roots.items()))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", required=True, help="clean-protocol run dir")
    ap.add_argument("--replicate", help="replicate run dir (optional)")
    ap.add_argument("--defaults", help="provider-defaults run dir (optional)")
    ap.add_argument("--providers", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    clean = load_evidence(args.clean)
    rep = load_evidence(args.replicate) if args.replicate and pathlib.Path(args.replicate).exists() else None
    dfl = load_evidence(args.defaults) if args.defaults and pathlib.Path(args.defaults).exists() else None
    providers = sorted(clean[clean["kind"] == "generation"]["provider"].unique())

    L = ["# Latest smoke results (auto-generated)", "",
         "Regenerate with `pnpm report` (or `bash scripts/report.sh`). "
         "Numbers only; discussion and approved claims: `docs/SMOKE-RESULTS.md`.", ""]

    # hygiene
    runs = [("clean protocol", args.clean, clean)]
    if rep is not None:
        runs.append(("replicate", args.replicate, rep))
    if dfl is not None:
        runs.insert(0, ("provider defaults", args.defaults, dfl))
    L += ["## Runs", "",
          md_table([[name, d, h["units"], h["ok"], h["errors"], h["na_capability"],
                     roots_line(pathlib.Path(d))]
                    for name, d, df in runs for h in [hygiene(df)]],
                   ["run", "dir", "gen units", "ok", "errors", "na", "merkle roots"]), ""]
    models = {m for _, _, df in runs for m in hygiene(df)["models"]}
    L += [f"`model_reported` on all ok responses: {', '.join(sorted(models))}", ""]

    # main per-provider table (clean run)
    bc, cc = bench_by_provider(clean), context_by_provider(clean)
    br = bench_by_provider(rep) if rep is not None else {}
    cr = context_by_provider(rep) if rep is not None else {}
    cd = context_by_provider(dfl) if dfl is not None else {}
    cons = consensus_report(greedy_texts(clean))
    agg = {a["provider"]: a for a in cons["provider_agreement"]}
    cons_r = consensus_report(greedy_texts(rep)) if rep is not None else None
    agg_r = {a["provider"]: a for a in cons_r["provider_agreement"]} if cons_r else {}
    selfa = ({a.provider: a for a in self_agreement(greedy_texts(clean), greedy_texts(rep))}
             if rep is not None else {})

    rows = []
    for p in providers:
        a, ar, s = agg.get(p), agg_r.get(p), selfa.get(p)
        rows.append([
            p, bc.get(p, "-"), br.get(p, "-"),
            cd.get(p, "-"), cc.get(p, "-"), cr.get(p, "-"),
            f"{a['n_match']}/{a['n_prompts']} ({a['rate']:.0%})" if a else "-",
            f"{ar['n_match']}/{ar['n_prompts']} ({ar['rate']:.0%})" if ar else "-",
            f"{s.n_match}/{s.n_prompts} ({s.rate:.0%})" if s else "-",
        ])
    L += ["## Per-provider results", "",
          md_table(rows, ["provider", "bench (clean)", "bench (rep)",
                          "context (defaults)", "context (clean)", "context (rep)",
                          "consensus match (clean)", "consensus match (rep)",
                          "self-agreement"]), "",
          f"Greedy prompts: {cons['n_prompts']}; unanimous: {cons['n_unanimous']}; "
          f"with consensus: {cons['n_with_consensus']}"
          + (f" (replicate: {cons_r['n_unanimous']} unanimous, "
             f"{cons_r['n_with_consensus']} with consensus)" if cons_r else ""), ""]

    # logprob availability
    lp = clean[(clean["kind"] == "generation") & (clean["probe"] == "logprob")]
    avail = {p: "yes" if (g["response_status"] == "ok").any() else "no"
             for p, g in lp.groupby("provider")}
    L += ["## Logprob availability", "",
          md_table([[p, avail.get(p, "-")] for p in providers], ["provider", "exposes logprobs"]), ""]

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(L) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
