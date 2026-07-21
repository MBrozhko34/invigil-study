"""Aggregate everything into verdicts.json -- the single input the site
generator consumes."""
import json
import pathlib

import pandas as pd
import yaml

from .holm import holm_bonferroni
from .loader import bench_frame, greedy_texts, load_evidence, pass_rates, context_frame
from .noise_floor import divergence_distribution
from .stats_rq1 import paired_gap
from .stats_rq2 import greedy_vs_noise
from .verdicts import assign_verdict


def run_analysis(data_dir: str, probes_yaml: str, reference: str, noise_pair: tuple[str, str],
                 advertised: dict[str, str], out_path: str) -> dict:
    cfg = yaml.safe_load(pathlib.Path(probes_yaml).read_text())
    alpha = float(cfg["thresholds"]["alpha"])
    threshold_pp = float(cfg["thresholds"]["functionalGapPp"])

    df = load_evidence(data_dir)
    providers = sorted(p for p in df["provider"].unique()
                       if p not in (reference, *noise_pair))

    rates = pass_rates(bench_frame(df))
    texts = greedy_texts(df)
    noise = divergence_distribution(texts, *noise_pair)

    rq1, rq2 = {}, {}
    for p in providers:
        try:
            rq1[p] = paired_gap(rates, p, reference, threshold_pp=threshold_pp)
        except ValueError:
            rq1[p] = None
        try:
            rq2[p] = greedy_vs_noise(divergence_distribution(texts, p, reference), noise, alpha=alpha)
        except ValueError:
            rq2[p] = None

    holm = holm_bonferroni({p: r.p_value for p, r in rq2.items() if r is not None}, alpha=alpha)

    gen = df[df["kind"] == "generation"]
    failure = gen.groupby("provider")["response_status"].apply(lambda s: float((s == "error").mean()))

    ctx = context_frame(df)

    verdicts = []
    for p in providers:
        v = assign_verdict(
            provider=p, rq1=rq1[p], rq2=rq2[p],
            rq2_reject_after_holm=holm.get(p, False),
            failure_rate=float(failure.get(p, 0.0)),
            advertised_precision=advertised.get(p, "unspecified"),
        )
        d = v.to_dict()
        if not ctx.empty and p in set(ctx["provider"]):
            cp = ctx[ctx["provider"] == p]
            d["context_retrieval"] = {
                str(int(depth)): float(g["retrieved"].mean())
                for depth, g in cp.groupby("depth_pct")
            }
        verdicts.append(d)

    out = {"reference": reference, "noise_pair": list(noise_pair),
           "alpha": alpha, "threshold_pp": threshold_pp, "verdicts": verdicts}
    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(out_path).write_text(json.dumps(out, indent=2))
    return out
