import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMockProvider } from "@invigil/providers";
import { planUnits, runCampaign, merkleizeAll, writeManifest, type CampaignOptions } from "../src/campaign.js";
import { isCanonicalLine } from "@invigil/core";

process.env.MOCK_KEY = "test-key";
process.env.SANDBOX_MODE = "local";

const SOLUTIONS: Record<string, string> = {
  running_max: "```python\ndef running_max(xs):\n    out = []\n    m = None\n    for x in xs:\n        m = x if m is None else max(m, x)\n        out.append(m)\n    return out\n```",
  collapse_ranges: "```python\ndef collapse_ranges(nums):\n    if not nums:\n        return ''\n    spans = []\n    start = prev = nums[0]\n    for n in nums[1:]:\n        if n == prev + 1:\n            prev = n\n        else:\n            spans.append((start, prev))\n            start = prev = n\n    spans.append((start, prev))\n    return ','.join(str(a) if a == b else f'{a}-{b}' for a, b in spans)\n```",
  balanced_delims: "```python\ndef balanced_delims(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in '([{':\n            stack.append(ch)\n        elif ch in pairs:\n            if not stack or stack.pop() != pairs[ch]:\n                return False\n    return not stack\n```",
};

function replyFor(prompt: string): string {
  for (const [entry, sol] of Object.entries(SOLUTIONS)) if (prompt.includes(`def ${entry}(`)) return sol;
  if (prompt.includes("vault access code")) {
    const m = /vault access code is ([A-Z2-9]{8})/.exec(prompt);
    return m ? `The code is ${m[1]}.` : "I could not find a code.";
  }
  return "deterministic greedy continuation output.";
}

function setupRepo(mockUrl: string): { repoRoot: string; dataDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "sen-repo-"));
  const realRoot = resolve(import.meta.dirname, "..", "..", "..");
  mkdirSync(join(repoRoot, "configs", "providers"), { recursive: true });
  mkdirSync(join(repoRoot, "tasks", "public"), { recursive: true });
  mkdirSync(join(repoRoot, "prompts"), { recursive: true });
  cpSync(join(realRoot, "tasks", "public"), join(repoRoot, "tasks", "public"), { recursive: true });
  cpSync(join(realRoot, "prompts", "greedy.jsonl"), join(repoRoot, "prompts", "greedy.jsonl"));
  cpSync(join(realRoot, "prompts", "logprob.jsonl"), join(repoRoot, "prompts", "logprob.jsonl"));

  writeFileSync(join(repoRoot, "configs", "study.yaml"), [
    "studyId: invigil-study-e2e",
    "model: { name: org/test-model, hfRevision: deadbeef }",
    "seed: 12345",
    "scheduleWindowsUtc: [{ startHour: 0, endHour: 24 }]",
    "budgetGbpCap: 10",
  ].join("\n"));

  writeFileSync(join(repoRoot, "configs", "probes.yaml"), [
    "bench: { tasksDirs: ['tasks/public'], k: 2, minGapHours: 0, maxTokens: 512, sandboxTimeoutS: 3 }",
    "greedy: { promptsFile: prompts/greedy.jsonl, maxTokens: 64 }",
    "logprob: { promptsFile: prompts/logprob.jsonl }",
    "context: { depthsPct: [50, 95], trialsPerDepth: 1, maxContextTokens: 512 }",
    "thresholds: { functionalGapPp: 3, alpha: '0.01' }",
  ].join("\n"));

  writeFileSync(join(repoRoot, "configs", "providers", "mock.yaml"), [
    "id: mock-alpha",
    "displayName: Mock Alpha",
    `baseUrl: ${mockUrl}`,
    "apiKeyEnv: MOCK_KEY",
    "modelSlug: org/test-model",
    "advertised: { precision: bf16, contextLength: 2048, pricePerMtokIn: '0.10', pricePerMtokOut: '0.30' }",
    "capabilities: { logprobs: true, seed: true, topK: false, completionsEndpoint: false }",
    "rateLimit: { requestsPerMinute: 100000 }",
    "timeoutMs: 5000",
  ].join("\n"));

  return { repoRoot, dataDir: join(repoRoot, "data") };
}

test("mini campaign end-to-end: plan, run, resume, merkleize, canonical evidence", async (t) => {
  const { server, url } = await startMockProvider({ replyFor, logprobs: true, modelReported: "org/test-model" });
  t.after(() => server.close());
  const { repoRoot, dataDir } = setupRepo(url);
  const opts: CampaignOptions = {
    repoRoot, dataDir,
    studyConfigPath: join(repoRoot, "configs", "study.yaml"),
    probesConfigPath: join(repoRoot, "configs", "probes.yaml"),
    providersDir: join(repoRoot, "configs", "providers"),
  };

  // plan: 3 tasks * k2 + 3 greedy + 3 logprob + 2 context = 14 units, deterministically shuffled
  const units = planUnits(opts);
  assert.equal(units.length, 14);
  assert.deepEqual(planUnits(opts).map((u) => u.key), units.map((u) => u.key)); // seed-stable

  writeManifest(opts);
  const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));
  assert.equal(manifest.unitCount, 14);

  // partial run then resume -- checkpointing must make the split invisible.
  // A rep-1 unit shuffled ahead of its rep-0 dep completes on a later pass;
  // production runs this loop from cron, so the test loops the same way.
  const first = await runCampaign({ ...opts, maxUnits: 5 });
  assert.equal(first.executed, 5);
  assert.equal(first.failures.length, 0);
  let total = first.executed;
  for (let pass = 0; pass < 5; pass++) {
    const r = await runCampaign(opts);
    assert.equal(r.failures.length, 0);
    total += r.executed;
    if (r.executed === 0) break;
  }
  assert.equal(total, 14);
  assert.equal((await runCampaign(opts)).executed, 0); // idempotent when complete

  // every evidence line is canonical; bench emitted generation+execution pairs
  const { EvidenceRepository } = await import("../src/repository.js");
  const repo = new EvidenceRepository(dataDir);
  const dates = repo.dates();
  assert.equal(dates.length, 1);
  const lines = repo.readLines(dates[0]);
  assert.ok(lines.length >= 14 + 6); // 14 generations + 6 executions (3 tasks * k2)
  for (const l of lines) assert.equal(isCanonicalLine(l), true);

  const parsed = lines.map((l) => JSON.parse(l));
  const execs = parsed.filter((r) => r.kind === "execution");
  assert.equal(execs.length, 6);
  for (const e of execs) {
    assert.equal(e.passed, e.total, `mock solutions must pass: ${e.task_id}`);
    assert.equal(e.sandbox_mode, "local"); // mode stamped -- visible this was not a production run
  }
  const ctx = parsed.filter((r) => r.probe === "context" && r.kind === "generation");
  assert.equal(ctx.length, 2);
  for (const c of ctx) assert.equal(c.retrieved, true);
  const lp = parsed.filter((r) => r.probe === "logprob");
  assert.ok(lp.every((r) => Array.isArray(r.logprobs) && r.logprobs.length > 0));

  // merkleize + stability across reload
  const roots = merkleizeAll(dataDir);
  const again = merkleizeAll(dataDir);
  assert.deepEqual(roots, again);
});

test("preflight: refuses to run when a provider API key env is missing", async (t) => {
  const { server, url } = await startMockProvider({ replyFor, logprobs: true, modelReported: "org/test-model" });
  t.after(() => server.close());
  const { repoRoot, dataDir } = setupRepo(url);
  const opts: CampaignOptions = {
    repoRoot, dataDir,
    studyConfigPath: join(repoRoot, "configs", "study.yaml"),
    probesConfigPath: join(repoRoot, "configs", "probes.yaml"),
    providersDir: join(repoRoot, "configs", "providers"),
  };
  const saved = process.env.MOCK_KEY;
  delete process.env.MOCK_KEY;
  try {
    await assert.rejects(() => runCampaign(opts), /preflight: missing API key env MOCK_KEY/);
    // nothing may be checkpointed or written by a preflight abort
    assert.equal((await import("node:fs")).existsSync(join(dataDir, "checkpoint.json")), false);
  } finally {
    process.env.MOCK_KEY = saved;
  }
});
