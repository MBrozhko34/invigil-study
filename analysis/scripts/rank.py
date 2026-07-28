"""Print the cross-provider consensus ranking and generate its results md.

Demo entry point, wired as `pnpm rank`. Console output is deliberately
minimal (rank, bar, rate); the full per-provider table goes to the generated
markdown (--out, default docs/results/ranking.md).

Reference-free measurement language only: the ranking is alignment-to-
consensus, never a quality verdict (METHODOLOGY section 6 boundary, same
rule as consensus.py).

Ranking rule (mechanical, pre-declared): providers are ordered by pooled
consensus-match rate across the clean run and the replicate (matches and
denominators summed over both runs, 95% Wilson interval on the pooled count).
Ties break on the lower CI bound, then provider id.

Usage:
  .venv/bin/python scripts/rank.py \
      --clean ../data --replicate ../data-rep2 \
      --providers ../smoke/configs/providers --out ../docs/results/ranking.md
"""
import argparse
import json
import os
import pathlib
import sys

import yaml

from invigil_analysis.consensus import (provider_agreement, self_agreement,
                                        wilson_interval)
from invigil_analysis.loader import context_frame, greedy_texts, load_evidence

BAR_WIDTH = 20

USE_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def c(code: str, s: str) -> str:
    return f"\x1b[{code}m{s}\x1b[0m" if USE_COLOR else s


def bar(rate: float) -> str:
    filled = round(rate * BAR_WIDTH)
    color = "32" if rate >= 0.95 else ("33" if rate >= 0.70 else "31")
    return c(color, "█" * filled) + c("2", "░" * (BAR_WIDTH - filled))


def bench_totals(df) -> dict[str, tuple[int, int]]:
    ex = df[df["kind"] == "execution"]
    return {p: (int(g["passed"].sum()), int(g["total"].sum()))
            for p, g in ex.groupby("provider")}


def context_totals(df) -> dict[str, tuple[int, int]]:
    if not {"depth_pct", "trial", "retrieved"}.issubset(df.columns):
        return {}  # run contained no context-probe records (e.g. greedy-only live demo)
    ctx = context_frame(df)
    ok = ctx[ctx["response_status"] == "ok"]
    return {p: (int(g["retrieved"].sum()), len(g)) for p, g in ok.groupby("provider")}


def logprob_availability(df) -> dict[str, bool]:
    lp = df[(df["kind"] == "generation") & (df["probe"] == "logprob")]
    return {p: bool((g["response_status"] == "ok").any())
            for p, g in lp.groupby("provider")}


def tiers(providers_dir: pathlib.Path) -> dict[str, str]:
    out = {}
    for f in sorted(providers_dir.glob("*.yaml")):
        cfg = yaml.safe_load(f.read_text())
        out[cfg["id"]] = str(cfg.get("advertised", {}).get("precision", "?"))
    return out


def roots_line(data_dir: pathlib.Path) -> str | None:
    f = data_dir / "roots.json"
    if not f.exists():
        return None
    roots = json.loads(f.read_text())
    return "; ".join(f"`{v['root']}` ({v['count']} leaves)"
                     for _, v in sorted(roots.items()))


def add(t: dict, key: str, pair: tuple[int, int]) -> None:
    a, b = t.get(key, (0, 0))
    t[key] = (a + pair[0], b + pair[1])


def build_rows(clean, rep) -> list[dict]:
    errors: dict[str, int] = {}
    for df in [clean] + ([rep] if rep is not None else []):
        gen = df[df["kind"] == "generation"]
        for p, n in gen[gen["response_status"] == "error"].groupby("provider").size().items():
            errors[p] = errors.get(p, 0) + int(n)

    g_clean = greedy_texts(clean)
    agg = {a.provider: a for a in provider_agreement(g_clean)}
    agg_r, selfa = {}, {}
    if rep is not None:
        g_rep = greedy_texts(rep)
        agg_r = {a.provider: a for a in provider_agreement(g_rep)}
        selfa = {a.provider: a for a in self_agreement(g_clean, g_rep)}

    bench: dict[str, tuple[int, int]] = {}
    ctx: dict[str, tuple[int, int]] = {}
    for df in [clean] + ([rep] if rep is not None else []):
        for p, pair in bench_totals(df).items():
            add(bench, p, pair)
        for p, pair in context_totals(df).items():
            add(ctx, p, pair)
    lp = logprob_availability(clean)

    rows = []
    for p in sorted(agg):
        a, ar = agg[p], agg_r.get(p)
        k = a.n_match + (ar.n_match if ar else 0)
        n = a.n_prompts + (ar.n_prompts if ar else 0)
        lo, hi = wilson_interval(k, n)
        rows.append({"provider": p, "rate": k / n if n else 0.0,
                     "k": k, "n": n, "lo": lo, "hi": hi,
                     "a": a, "ar": ar, "self": selfa.get(p),
                     "bench": bench.get(p, (0, 0)), "ctx": ctx.get(p, (0, 0)),
                     "logprobs": lp.get(p), "errors": errors.get(p, 0)})
    rows.sort(key=lambda r: (-r["rate"], -r["lo"], r["provider"]))
    return rows


def print_console(rows, models, n_runs, selfa_rates, out_path) -> None:
    title = f"  INVIGIL · consensus ranking · {', '.join(models)}"
    width = max(4 + 3 + 16 + BAR_WIDTH + 6, len(title) + 2)
    rule = c("2", "─" * width)
    print(rule)
    print("  " + c("1;36", "INVIGIL") + c("2", " · ") + "consensus ranking"
          + c("2", " · ") + ", ".join(models))
    print(rule)
    for i, r in enumerate(rows, 1):
        note = c("2", f"  {r['k']}/{r['n']}")
        if r["errors"]:
            note += c("31", f" · {r['errors']} err")
        print(f"  {i:<3}{r['provider']:<16}{bar(r['rate'])} {r['rate']:>4.0%}{note}")
    print(rule)
    if selfa_rates:
        print("  " + c("2", f"noise floor {min(selfa_rates):.0%} to "
                            f"{max(selfa_rates):.0%} · ranking replicates "
                            f"across {n_runs} independent runs"))
    print("  " + c("2", f"evidence merkle-committed · full table: {out_path}"))
    print(rule)


def write_md(rows, models, n_runs, n_records, data_dirs, out: pathlib.Path,
             tier: dict[str, str]) -> None:
    def pct(v: float) -> str:
        return f"{v:.0%}"

    lines = [
        "# Consensus ranking (auto-generated)", "",
        "Regenerate with `pnpm rank`. Reference-free: alignment to the cross-provider",
        "consensus text, never a quality verdict. Ranking rule (mechanical): pooled",
        "consensus-match rate across both committed runs, 95% Wilson CI, ties broken",
        "by lower CI bound. Discussion and approved claims: `docs/SMOKE-RESULTS.md`.", "",
        f"Model: {', '.join(models)} · {len(rows)} providers "
        f"· {n_runs} committed run{'s' if n_runs != 1 else ''} "
        f"· {n_records} evidence records", "",
        "| # | provider | advertised tier | pooled alignment | 95% CI | run 2 | run 3 "
        "| self-agreement | bench | context | logprobs |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    def frac(pair: tuple[int, int]) -> str:
        return f"{pair[0]}/{pair[1]}" if pair[1] else "-"

    for i, r in enumerate(rows, 1):
        a, ar, s = r["a"], r["ar"], r["self"]
        lp = "-" if r["logprobs"] is None else ("yes" if r["logprobs"] else "no")
        lines.append(
            f"| {i} | {r['provider']} | {tier.get(r['provider'], '?')} "
            f"| {r['k']}/{r['n']} ({pct(r['rate'])}) "
            f"| [{pct(r['lo'])}, {pct(r['hi'])}] "
            f"| {a.n_match}/{a.n_prompts} "
            f"| {f'{ar.n_match}/{ar.n_prompts}' if ar else '-'} "
            f"| {f'{s.n_match}/{s.n_prompts} ({pct(s.rate)})' if s else '-'} "
            f"| {frac(r['bench'])} | {frac(r['ctx'])} "
            f"| {lp} |")
    lines += ["",
              "Self-agreement is the temperature-0 run-to-run noise floor (run 2 vs"
              " run 3, same prompts, same provider). Bench and context are pooled"
              " over both runs.", ""]
    roots = [rl for d in data_dirs if (rl := roots_line(pathlib.Path(d)))]
    if roots:
        lines += ["Evidence merkle roots: " + "; ".join(roots), ""]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", required=True, help="clean-protocol run dir")
    ap.add_argument("--replicate", help="replicate run dir (optional)")
    ap.add_argument("--providers", required=True)
    ap.add_argument("--out", default="docs/results/ranking.md")
    args = ap.parse_args()

    clean = load_evidence(args.clean)
    rep_dir = args.replicate if args.replicate and pathlib.Path(args.replicate).exists() else None
    rep = load_evidence(rep_dir) if rep_dir else None

    rows = build_rows(clean, rep)

    gen = clean[clean["kind"] == "generation"]
    models = sorted(gen.loc[gen["response_status"] == "ok", "model_reported"].unique())
    n_records = len(clean) + (len(rep) if rep is not None else 0)
    n_runs = 2 if rep is not None else 1
    data_dirs = [args.clean] + ([rep_dir] if rep_dir else [])

    tier = tiers(pathlib.Path(args.providers))
    out = pathlib.Path(args.out)
    write_md(rows, models, n_runs, n_records, data_dirs, out, tier)

    selfa_rates = [r["self"].rate for r in rows if r["self"]]
    print_console(rows, models, n_runs, selfa_rates, out)


if __name__ == "__main__":
    main()
