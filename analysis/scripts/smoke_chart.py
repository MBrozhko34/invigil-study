"""Render the smoke-study headline chart (two panels, computed from evidence).

Panel A: context needle retrieval, run 1 (provider defaults) vs run 2
         (explicit parameters) -- the silent-defaults divergence.
Panel B: temperature-0 agreement with cross-provider consensus (run 2),
         Wilson 95% intervals, from consensus.json.

Usage:
  .venv/bin/python scripts/smoke_chart.py \
      --run1 ../data-run1-provider-defaults --run2 ../data \
      --consensus ../data/analysis/consensus.json \
      --out ../docs/charts/smoke-divergence.png
"""
import argparse
import json
import pathlib

import matplotlib.pyplot as plt
import numpy as np

from invigil_analysis.loader import context_frame, load_evidence

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e6e5e2"
BLUE = "#2a78d6"    # series: explicit parameters / run 2
ORANGE = "#eb6834"  # series: provider defaults / run 1

DISPLAY = {"or-atlascloud": "AtlasCloud", "or-baidu": "Baidu",
           "or-cloudflare": "Cloudflare", "or-deepinfra": "DeepInfra",
           "or-wandb": "WandB"}


def retrieval_rates(data_dir: str) -> dict[str, tuple[float, int]]:
    ctx = context_frame(load_evidence(data_dir))
    ok = ctx[ctx["response_status"] == "ok"]
    return {p: (float(g["retrieved"].mean()), len(g)) for p, g in ok.groupby("provider")}


def style_axis(ax):
    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK_2, labelsize=9)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run1", required=True)
    ap.add_argument("--run2", required=True)
    ap.add_argument("--consensus", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    r1 = retrieval_rates(args.run1)
    r2 = retrieval_rates(args.run2)
    cons = json.loads(pathlib.Path(args.consensus).read_text())
    providers = sorted(set(r1) & set(r2))

    fig, (ax_a, ax_b) = plt.subplots(1, 2, figsize=(11, 4.4), dpi=200)
    fig.patch.set_facecolor(SURFACE)

    # ---- Panel A: grouped bars, defaults vs explicit ----
    x = np.arange(len(providers))
    w = 0.36
    ax_a.bar(x - w / 2, [100 * r1[p][0] for p in providers], w,
             color=ORANGE, label="Run 1: provider defaults", zorder=3)
    ax_a.bar(x + w / 2, [100 * r2[p][0] for p in providers], w,
             color=BLUE, label="Run 2: explicit parameters", zorder=3)
    for xi, p in zip(x, providers):
        v1 = 100 * r1[p][0]
        ax_a.text(xi - w / 2, v1 + 3 if v1 < 95 else v1 - 9, f"{v1:.0f}",
                  ha="center", fontsize=8, color=INK if v1 < 95 else SURFACE, zorder=4)
    style_axis(ax_a)
    ax_a.set_xticks(x, [DISPLAY.get(p, p) for p in providers])
    ax_a.set_ylim(0, 108)
    ax_a.set_yticks([0, 25, 50, 75, 100])
    ax_a.grid(axis="y", color=GRID, linewidth=0.8, zorder=0)
    ax_a.set_ylabel("Needle retrieval, % of trials", color=INK_2, fontsize=9)
    ax_a.set_title("Identical requests: provider DEFAULTS silently\nchange long-context results",
                   fontsize=10.5, color=INK, loc="left", pad=10)
    ax_a.legend(frameon=False, fontsize=8, labelcolor=INK_2, ncols=2,
                loc="upper center", bbox_to_anchor=(0.5, -0.10),
                columnspacing=1.2, handlelength=1.4)

    # ---- Panel B: consensus agreement with Wilson CIs ----
    agg = sorted(cons["provider_agreement"], key=lambda a: a["rate"])
    y = np.arange(len(agg))
    for yi, a in zip(y, agg):
        ax_b.plot([100 * a["ci_low"], 100 * a["ci_high"]], [yi, yi],
                  color=BLUE, linewidth=2, alpha=0.45, zorder=2,
                  solid_capstyle="round")
        ax_b.plot(100 * a["rate"], yi, "o", color=BLUE, markersize=9, zorder=3)
        ax_b.text(100 * a["ci_high"] + 2.5, yi, f"{a['n_match']}/{a['n_prompts']}",
                  va="center", fontsize=8, color=INK_2)
    style_axis(ax_b)
    ax_b.set_yticks(y, [DISPLAY.get(a["provider"], a["provider"]) for a in agg])
    ax_b.set_xlim(0, 115)
    ax_b.set_xticks([0, 25, 50, 75, 100])
    ax_b.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    ax_b.set_xlabel("Agreement with cross-provider consensus, % (95% CI)",
                    color=INK_2, fontsize=9)
    ax_b.set_title("Same model, temperature 0: providers disagree\nwith the consensus at different rates",
                   fontsize=10.5, color=INK, loc="left", pad=10)

    fig.suptitle("invigil-smoke-001: five pinned providers serving deepseek/deepseek-v4-flash",
                 fontsize=9, color=INK_2, x=0.01, y=0.015, ha="left")
    fig.tight_layout(rect=(0, 0.06, 1, 1))

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=SURFACE, bbox_inches="tight")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
