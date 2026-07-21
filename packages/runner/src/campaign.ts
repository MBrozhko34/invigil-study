/**
 * Pipeline steps: plan -> run -> merkleize. Each is idempotent; `run` is
 * checkpoint-resumable and executes only currently-eligible units, then
 * reports the next wake time -- cron-friendly by design (no daemon).
 */
import { join } from "node:path";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { fromHex, publicKeyOf, keccak256, toHex, utf8 } from "@invigil/core";
import { loadAllProviderConfigs, makeAdapters, type FetchLike } from "@invigil/providers";
import { sandboxFromEnv } from "@invigil/sandbox";
import { loadStudyConfig, loadProbesConfig } from "./config.js";
import { EvidenceRepository } from "./repository.js";
import { Checkpoint } from "./checkpoint.js";
import { eligibility, seededShuffle, type WorkUnit } from "./scheduler.js";
import type { ProbeContext, ProbeStrategy } from "./probes/types.js";
import { BenchProbe } from "./probes/bench.js";
import { GreedyProbe } from "./probes/greedy.js";
import { LogprobProbe } from "./probes/logprob.js";
import { ContextProbe } from "./probes/context.js";

export interface CampaignOptions {
  repoRoot: string;
  dataDir: string;
  studyConfigPath: string;
  probesConfigPath: string;
  providersDir: string;
  fetchImpl?: FetchLike;       // injected in tests / dry runs
  now?: () => Date;
  families?: string[];         // subset filter
  maxUnits?: number;           // safety cap per invocation
}

const STRATEGIES: ProbeStrategy[] = [new BenchProbe(), new GreedyProbe(), new LogprobProbe(), new ContextProbe()];

export function buildContext(o: CampaignOptions): { ctx: ProbeContext; providerIds: string[] } {
  const study = loadStudyConfig(o.studyConfigPath);
  const probes = loadProbesConfig(o.probesConfigPath);
  const providerIds = loadAllProviderConfigs(o.providersDir).map((c) => c.id);
  const ctx: ProbeContext = {
    study, probes, repoRoot: o.repoRoot, sandbox: sandboxFromEnv(), now: o.now ?? (() => new Date()),
  };
  return { ctx, providerIds };
}

export function planUnits(o: CampaignOptions): WorkUnit[] {
  const { ctx, providerIds } = buildContext(o);
  const families = o.families ?? STRATEGIES.map((s) => s.family);
  let units: WorkUnit[] = [];
  for (const s of STRATEGIES) if (families.includes(s.family)) units = units.concat(s.plan(ctx, providerIds));
  // Deterministic randomized interleaving (METHODOLOGY section 3: ordering randomized, reproducible from seed)
  return seededShuffle(units, ctx.study.seed);
}

export function writeManifest(o: CampaignOptions): string {
  const study = readFileSync(o.studyConfigPath, "utf8");
  const probes = readFileSync(o.probesConfigPath, "utf8");
  const units = planUnits(o);
  const manifest = {
    createdAt: new Date().toISOString(),
    studyConfigSha: toHex(keccak256(utf8(study))),
    probesConfigSha: toHex(keccak256(utf8(probes))),
    unitCount: units.length,
    unitKeysSha: toHex(keccak256(utf8(units.map((u) => u.key).join("\n")))),
  };
  mkdirSync(o.dataDir, { recursive: true });
  const p = join(o.dataDir, "manifest.json");
  writeFileSync(p, JSON.stringify(manifest, null, 2));
  return p;
}

export interface RunReport {
  executed: number;
  skipped: Record<string, number>;
  nextWake: string | null;
  failures: { key: string; error: string }[];
}

export async function runCampaign(o: CampaignOptions): Promise<RunReport> {
  const { ctx, providerIds } = buildContext(o);
  const configs = loadAllProviderConfigs(o.providersDir);
  // Preflight: a missing key env would fail EVERY unit through the retry
  // budget and checkpoint them all as done (learned 2026-07-22). Abort first.
  const missingKeys = [...new Set(configs.filter((c) => !process.env[c.apiKeyEnv]).map((c) => c.apiKeyEnv))];
  if (missingKeys.length) {
    throw new Error(`preflight: missing API key env ${missingKeys.join(", ")}; refusing to run (all units would error and checkpoint as done)`);
  }
  const adapters = makeAdapters(configs, o.fetchImpl);
  const repo = new EvidenceRepository(o.dataDir, signingFromEnv(ctx.study.methodologyHash));
  const cp = new Checkpoint(join(o.dataDir, "checkpoint.json"));
  const units = planUnits(o);

  const report: RunReport = { executed: 0, skipped: {}, nextWake: null, failures: [] };
  let earliest: Date | null = null;

  for (const u of units) {
    if (o.maxUnits !== undefined && report.executed >= o.maxUnits) break;
    const e = eligibility(u, cp, ctx.study, ctx.now());
    if (!e.eligible) {
      report.skipped[e.reason] = (report.skipped[e.reason] ?? 0) + 1;
      if ("notBefore" in e && e.notBefore && (!earliest || e.notBefore < earliest)) earliest = e.notBefore;
      continue;
    }
    const adapter = adapters.get(u.providerId);
    if (!adapter) { report.failures.push({ key: u.key, error: "no adapter" }); continue; }
    const strategy = STRATEGIES.find((s) => s.family === u.probe)!;
    try {
      const records = await strategy.execute(u, adapter, ctx);
      for (const r of records) repo.append(r, ctx.now);
      cp.markDone(u.key, ctx.now());
      report.executed++;
    } catch (err: any) {
      report.failures.push({ key: u.key, error: err?.message ?? String(err) });
    }
  }
  report.nextWake = earliest ? earliest.toISOString() : null;
  return report;
}

export function merkleizeAll(dataDir: string): Record<string, { root: string; count: number }> {
  const repo = new EvidenceRepository(dataDir);
  for (const d of repo.dates()) repo.merkleize(d);
  return repo.readRoots();
}

function signingFromEnv(methodologyHash: string) {
  const k = process.env.INVIGIL_SIGNING_KEY;
  if (!k) return undefined;
  const privateKey = fromHex(k);
  return { privateKey, publicKey: publicKeyOf(privateKey), methodologyHash };
}
