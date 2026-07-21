/**
 * TASK 15 -- full-pipeline dry run (METHODOLOGY Stage A exit artifact):
 *   3 mock providers (two consistent "reference runs" + one planted-degraded)
 *   -> campaign -> evidence log -> merkleize -> receipts
 *   -> verifier passes on clean bundle, REJECTS a tampered copy
 *   -> Python analysis assigns DIVERGENT_QUALITY to the planted provider
 *   -> static site renders the verdict.
 * This is the whole study, in miniature, against known ground truth.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMockProvider } from "@invigil/providers";
import { runCampaign, merkleizeAll, type CampaignOptions } from "@invigil/runner";
import { verifyEvidenceDir } from "@invigil/verifier-cli";
import { randomPrivateKey, toHex } from "@invigil/core";

process.env.MOCK_KEY = "e2e-key";
process.env.SANDBOX_MODE = "local";
process.env.INVIGIL_SIGNING_KEY = toHex(randomPrivateKey()).slice(2);

const REAL_ROOT = resolve(import.meta.dirname, "..", "..", "..");

const SOLUTIONS: Record<string, string> = {
  running_max: "```python\ndef running_max(xs):\n    out = []\n    m = None\n    for x in xs:\n        m = x if m is None else max(m, x)\n        out.append(m)\n    return out\n```",
  collapse_ranges: "```python\ndef collapse_ranges(nums):\n    if not nums:\n        return ''\n    spans = []\n    start = prev = nums[0]\n    for n in nums[1:]:\n        if n == prev + 1:\n            prev = n\n        else:\n            spans.append((start, prev))\n            start = prev = n\n    spans.append((start, prev))\n    return ','.join(str(a) if a == b else f'{a}-{b}' for a, b in spans)\n```",
  balanced_delims: "```python\ndef balanced_delims(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in '([{':\n            stack.append(ch)\n        elif ch in pairs:\n            if not stack or stack.pop() != pairs[ch]:\n                return False\n    return not stack\n```",
};

function baseGreedy(prompt: string): string {
  // deterministic, provider-independent "reference" continuation, ~900 chars
  return ("REF::" + prompt + "::").repeat(40).slice(0, 900);
}

function makeReply(kind: "good" | "degraded") {
  return (prompt: string): string => {
    const vault = /vault access code is ([A-Z2-9]{8})/.exec(prompt);
    if (vault) return kind === "good" ? `The code is ${vault[1]}.` : "I do not recall any code.";
    for (const [entry, sol] of Object.entries(SOLUTIONS))
      if (prompt.includes(`def ${entry}(`))
        return kind === "good" ? sol : "```python\ndef broken():\n    return None\n```";
    if (prompt.includes("single word") || prompt.includes("single digit") || prompt.includes("True or False"))
      return kind === "good" ? "lambda" : "def";
    const base = baseGreedy(prompt);
    return kind === "good" ? base : base.slice(0, 10) + "Z".repeat(890);
  };
}

function writeConfigs(repoRoot: string, urls: Record<string, string>): void {
  mkdirSync(join(repoRoot, "configs", "providers"), { recursive: true });
  mkdirSync(join(repoRoot, "tasks", "public"), { recursive: true });
  mkdirSync(join(repoRoot, "prompts"), { recursive: true });
  cpSync(join(REAL_ROOT, "tasks", "public"), join(repoRoot, "tasks", "public"), { recursive: true });
  cpSync(join(REAL_ROOT, "prompts", "logprob.jsonl"), join(repoRoot, "prompts", "logprob.jsonl"));
  // 40 generated greedy prompts so the Mann-Whitney test has real sample size
  writeFileSync(join(repoRoot, "prompts", "greedy.jsonl"),
    Array.from({ length: 40 }, (_, i) => JSON.stringify({ id: `g-${String(i).padStart(3, "0")}`, prompt: `Continue sequence ${i}: alpha beta gamma` })).join("\n") + "\n");

  writeFileSync(join(repoRoot, "configs", "study.yaml"), [
    "studyId: invigil-study-e2e",
    "model: { name: org/test-model, hfRevision: deadbeef }",
    "seed: 777",
    "scheduleWindowsUtc: [{ startHour: 0, endHour: 24 }]",
    "budgetGbpCap: 10",
  ].join("\n"));

  writeFileSync(join(repoRoot, "configs", "probes.yaml"), [
    "bench: { tasksDirs: ['tasks/public'], k: 2, minGapHours: 0, maxTokens: 512, sandboxTimeoutS: 3 }",
    "greedy: { promptsFile: prompts/greedy.jsonl, maxTokens: 128 }",
    "logprob: { promptsFile: prompts/logprob.jsonl }",
    "context: { depthsPct: [50], trialsPerDepth: 1, maxContextTokens: 512 }",
    "thresholds: { functionalGapPp: 3, alpha: '0.01' }",
  ].join("\n"));

  for (const [id, url] of Object.entries(urls)) {
    writeFileSync(join(repoRoot, "configs", "providers", `${id}.yaml`), [
      `id: ${id}`,
      `displayName: ${id}`,
      `baseUrl: ${url}`,
      "apiKeyEnv: MOCK_KEY",
      "modelSlug: org/test-model",
      "advertised: { precision: bf16, contextLength: 2048, pricePerMtokIn: '0.10', pricePerMtokOut: '0.30' }",
      "capabilities: { logprobs: true, seed: true, topK: false, completionsEndpoint: false }",
      "rateLimit: { requestsPerMinute: 100000 }",
      "timeoutMs: 5000",
    ].join("\n"));
  }
}

test("full pipeline dry run: campaign -> merkle -> verify -> tamper-reject -> analysis -> site", async (t) => {
  const refA = await startMockProvider({ replyFor: makeReply("good"), logprobs: true, modelReported: "org/test-model" });
  const refB = await startMockProvider({ replyFor: makeReply("good"), logprobs: true, modelReported: "org/test-model" });
  const degraded = await startMockProvider({ replyFor: makeReply("degraded"), logprobs: true, modelReported: "org/test-model" });
  t.after(() => { refA.server.close(); refB.server.close(); degraded.server.close(); });

  const repoRoot = mkdtempSync(join(tmpdir(), "sen-e2e-"));
  writeConfigs(repoRoot, { "ref-a": refA.url, "ref-b": refB.url, "degraded": degraded.url });
  const dataDir = join(repoRoot, "data");
  const opts: CampaignOptions = {
    repoRoot, dataDir,
    studyConfigPath: join(repoRoot, "configs", "study.yaml"),
    probesConfigPath: join(repoRoot, "configs", "probes.yaml"),
    providersDir: join(repoRoot, "configs", "providers"),
  };

  // --- campaign to completion (cron-loop semantics) ---
  let executed = 0;
  for (let pass = 0; pass < 6; pass++) {
    const r = await runCampaign(opts);
    assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
    executed += r.executed;
    if (r.executed === 0) break;
  }
  // 3 tasks*k2*3prov=18 bench + 40*3 greedy + 3*3 logprob + 1*3 context = 150 units
  assert.equal(executed, 150);

  // --- merkleize + independent verification ---
  const roots = merkleizeAll(dataDir);
  assert.ok(Object.keys(roots).length >= 1);
  const clean = verifyEvidenceDir(dataDir);
  assert.ok(clean.every((c) => c.ok), JSON.stringify(clean.filter((c) => !c.ok)));
  assert.ok(clean.some((c) => c.name.startsWith("receipts")), "receipts were signed and checked");

  // --- tampered copy must be rejected ---
  const tampered = mkdtempSync(join(tmpdir(), "sen-tamper-"));
  cpSync(dataDir, tampered, { recursive: true });
  const date = Object.keys(roots)[0];
  const f = join(tampered, "evidence", `${date}.jsonl`);
  const lines = readFileSync(f, "utf8").trim().split("\n");
  const idx = lines.findIndex((l) => l.includes('"probe":"greedy"') && l.includes('"provider":"degraded"'));
  lines[idx] = lines[idx].replace('"provider":"degraded"', '"provider":"degradez"'); // still canonical -> root catches it
  writeFileSync(f, lines.join("\n") + "\n");
  const dirty = verifyEvidenceDir(tampered);
  assert.ok(dirty.some((c) => !c.ok), "tampered bundle must fail verification");

  // --- pre-declared analysis assigns the planted verdict ---
  const verdictsPath = join(repoRoot, "verdicts.json");
  const py = [
    "import json, sys",
    "from invigil_analysis.report_export import run_analysis",
    "out = run_analysis(sys.argv[1], sys.argv[2], 'ref-a', ('ref-a', 'ref-b'), {'degraded': 'bf16'}, sys.argv[3])",
    "print(json.dumps(out))",
  ].join("\n");
  // invigil_analysis must be importable: INVIGIL_PYTHON > analysis/.venv > PATH
  const venvPython = join(REAL_ROOT, "analysis", ".venv", "bin", "python");
  const pythonBin = process.env.INVIGIL_PYTHON ?? (existsSync(venvPython) ? venvPython : "python3");
  const out = JSON.parse(execFileSync(pythonBin, ["-c", py, dataDir, join(repoRoot, "configs", "probes.yaml"), verdictsPath], { encoding: "utf8" }));
  assert.equal(out.verdicts.length, 1);
  assert.equal(out.verdicts[0].provider, "degraded");
  assert.equal(out.verdicts[0].category, "DIVERGENT_QUALITY");
  assert.ok(out.verdicts[0].rq1_gap_pp > 50); // planted: fails every task

  // --- site renders the verdict ---
  const sitePath = join(repoRoot, "index.html");
  execFileSync("npx", ["tsx", join(REAL_ROOT, "site", "generate.ts"), verdictsPath, join(dataDir, "roots.json"), sitePath], { encoding: "utf8", cwd: REAL_ROOT });
  assert.ok(existsSync(sitePath));
  const html = readFileSync(sitePath, "utf8");
  assert.ok(html.includes("degraded"));
  assert.ok(html.includes("Divergent — quality-affecting"));
  assert.ok(html.includes(roots[date].root)); // evidence anchors panel
});
