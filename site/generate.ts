#!/usr/bin/env node
/**
 * Static leaderboard/report generator (v0 -- METHODOLOGY section 11 deliverable).
 * Input:  analysis/out/verdicts.json (+ optional data/roots.json for the evidence panel)
 * Output: site/out/index.html -- a single self-contained page, GitHub-Pages ready.
 * No framework, no client JS beyond none: the page is the artifact.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const CATEGORY_META: Record<string, { label: string; cls: string; blurb: string }> = {
  CONSISTENT: { label: "Consistent", cls: "ok", blurb: "No pre-declared threshold crossed." },
  DIVERGENT_QUALITY: { label: "Divergent — quality-affecting", cls: "bad", blurb: "Functional gap beyond threshold with distributional corroboration." },
  DIVERGENT_DISTRIBUTION: { label: "Divergent — distribution only", cls: "warn", blurb: "Output distribution diverges beyond the noise floor; functional impact not established." },
  TEMPLATE_CONFOUNDED: { label: "Template-confounded", cls: "warn", blurb: "Divergence plausibly attributable to chat-template differences." },
  CONSISTENT_WITH_ADVERTISED_QUANTIZATION: { label: "Consistent with advertised quantization", cls: "ok", blurb: "Provider discloses a quantized endpoint and matches that profile — honest serving." },
  INSUFFICIENT_DATA: { label: "Insufficient data", cls: "na", blurb: "Failure rate above budget or probes not applicable." },
};

export interface VerdictsFile {
  reference: string;
  noise_pair: string[];
  alpha: number;
  threshold_pp: number;
  verdicts: Array<{
    provider: string; category: string; notes: string;
    rq1_gap_pp: number | null; rq1_ci: [number, number] | null;
    rq2_p: number | null; rq2_effect: number | null;
    context_retrieval?: Record<string, number>;
  }>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : v.toFixed(digits));
const pval = (p: number | null) => (p === null ? "—" : p < 0.0001 ? "<0.0001" : p.toFixed(4));

export function renderSite(v: VerdictsFile, roots: Record<string, { root: string; count: number }> | null, generatedAt: string): string {
  const order = ["DIVERGENT_QUALITY", "DIVERGENT_DISTRIBUTION", "TEMPLATE_CONFOUNDED", "INSUFFICIENT_DATA", "CONSISTENT_WITH_ADVERTISED_QUANTIZATION", "CONSISTENT"];
  const sorted = [...v.verdicts].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.provider.localeCompare(b.provider));

  const rows = sorted.map((x) => {
    const m = CATEGORY_META[x.category] ?? CATEGORY_META.INSUFFICIENT_DATA;
    const ci = x.rq1_ci ? `[${num(x.rq1_ci[0])}, ${num(x.rq1_ci[1])}]` : "—";
    return `<tr>
      <td class="prov">${esc(x.provider)}</td>
      <td><span class="badge ${m.cls}">${esc(m.label)}</span></td>
      <td class="num">${num(x.rq1_gap_pp)}</td>
      <td class="num">${ci}</td>
      <td class="num">${pval(x.rq2_p)}</td>
      <td class="num">${num(x.rq2_effect, 2)}</td>
    </tr>`;
  }).join("\n");

  const cards = sorted.map((x) => {
    const m = CATEGORY_META[x.category] ?? CATEGORY_META.INSUFFICIENT_DATA;
    const ctx = x.context_retrieval
      ? `<div class="ctx">Context retrieval: ${Object.entries(x.context_retrieval)
          .map(([d, r]) => `${d}% depth → ${(r * 100).toFixed(0)}%`).join(" · ")}</div>`
      : "";
    return `<div class="card ${m.cls}">
      <h3>${esc(x.provider)} <span class="badge ${m.cls}">${esc(m.label)}</span></h3>
      <p class="blurb">${esc(m.blurb)}</p>
      <p class="notes">${esc(x.notes)}</p>${ctx}
    </div>`;
  }).join("\n");

  const rootsRows = roots
    ? Object.entries(roots).map(([d, r]) =>
        `<tr><td>${esc(d)}</td><td class="mono">${esc(r.root)}</td><td class="num">${r.count}</td></tr>`).join("\n")
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invigil Study 001 — Provider Fidelity Leaderboard</title>
<style>
:root{--ok:#177245;--bad:#b3261e;--warn:#9a6700;--na:#6b7280;--ink:#111827;--mut:#6b7280;--line:#e5e7eb}
*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);margin:0;padding:2rem 1rem;max-width:960px;margin-inline:auto}
h1{font-size:1.6rem;margin:.2rem 0}.sub{color:var(--mut);margin:0 0 1.5rem}
table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{padding:.5rem .6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
.num{text-align:right;font-variant-numeric:tabular-nums}.mono{font-family:ui-monospace,Menlo,monospace;font-size:.75rem;word-break:break-all}
.badge{display:inline-block;padding:.15rem .55rem;border-radius:999px;font-size:.75rem;font-weight:600;color:#fff}
.badge.ok{background:var(--ok)}.badge.bad{background:var(--bad)}.badge.warn{background:var(--warn)}.badge.na{background:var(--na)}
.card{border:1px solid var(--line);border-left-width:4px;border-radius:8px;padding: .9rem 1rem;margin:.8rem 0}
.card.ok{border-left-color:var(--ok)}.card.bad{border-left-color:var(--bad)}.card.warn{border-left-color:var(--warn)}.card.na{border-left-color:var(--na)}
.card h3{margin:.1rem 0 .4rem;font-size:1.05rem}.blurb{color:var(--mut);margin:.2rem 0}.notes{margin:.2rem 0}.ctx{color:var(--mut);font-size:.9rem;margin-top:.35rem}
footer{color:var(--mut);font-size:.85rem;margin-top:2.5rem;border-top:1px solid var(--line);padding-top:1rem}
</style></head><body>
<h1>Invigil Study 001 — Provider Fidelity</h1>
<p class="sub">Reference: <b>${esc(v.reference)}</b> · noise floor: ${esc(v.noise_pair.join(" ~ "))} ·
functional threshold ${v.threshold_pp}pp · α=${v.alpha} · generated ${esc(generatedAt)}</p>

<table>
<thead><tr><th>Provider</th><th>Verdict</th><th>Gap (pp)</th><th>95% CI</th><th>RQ2 p</th><th>Effect (r<sub>rb</sub>)</th></tr></thead>
<tbody>
${rows}
</tbody></table>

${cards}

${roots ? `<h2>Evidence anchors</h2>
<p class="sub">Recompute these roots yourself from the published logs: <span class="mono">npx invigil-verify data/</span></p>
<table><thead><tr><th>Day</th><th>Merkle root (keccak256, sorted-pair)</th><th>Records</th></tr></thead><tbody>
${rootsRows}
</tbody></table>` : ""}

<footer>Verdicts follow the pre-registered methodology mechanically — measurements and category assignments,
never claims of intent. Full methodology, raw evidence, and the independent verifier are published alongside this page.</footer>
</body></html>`;
}

// CLI entry
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const verdictsPath = process.argv[2] ?? join(HERE, "..", "analysis", "out", "verdicts.json");
  const rootsPath = process.argv[3] ?? join(HERE, "..", "data", "roots.json");
  const outPath = process.argv[4] ?? join(HERE, "out", "index.html");
  const v: VerdictsFile = JSON.parse(readFileSync(verdictsPath, "utf8"));
  const roots = existsSync(rootsPath) ? JSON.parse(readFileSync(rootsPath, "utf8")) : null;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderSite(v, roots, new Date().toISOString()));
  console.log("wrote", outPath);
}
