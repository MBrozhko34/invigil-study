import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSite, type VerdictsFile } from "../generate.js";

const sample: VerdictsFile = {
  reference: "ref-bf16-a", noise_pair: ["ref-bf16-a", "ref-bf16-b"], alpha: 0.01, threshold_pp: 3,
  verdicts: [
    { provider: "good", category: "CONSISTENT", notes: "no threshold crossed", rq1_gap_pp: 0.4, rq1_ci: [-1.1, 1.9], rq2_p: 0.4, rq2_effect: 0.02 },
    { provider: "bad", category: "DIVERGENT_QUALITY", notes: "gap 7.1pp", rq1_gap_pp: 7.1, rq1_ci: [4.2, 10.0], rq2_p: 0.00001, rq2_effect: 0.93,
      context_retrieval: { "25": 1, "95": 0.4 } },
  ],
};

test("renders both verdict rows, sorts divergent first, escapes html", () => {
  const html = renderSite({ ...sample, verdicts: [...sample.verdicts, { provider: "<script>x", category: "CONSISTENT", notes: "a&b", rq1_gap_pp: null, rq1_ci: null, rq2_p: null, rq2_effect: null }] }, { "2026-08-01": { root: "0xabc", count: 42 } }, "2026-07-14T00:00:00Z");
  assert.ok(html.indexOf("bad") < html.indexOf("good"));
  assert.ok(html.includes("Divergent — quality-affecting"));
  assert.ok(html.includes("&lt;script&gt;x"));
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("0xabc"));
  assert.ok(html.includes("95% depth → 40%"));
});
