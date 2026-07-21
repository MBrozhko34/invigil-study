import type { OpenAICompatibleAdapter } from "@invigil/providers";
import type { SandboxRunner } from "@invigil/sandbox";
import type { Canonical } from "@invigil/core";
import type { StudyConfig, ProbesConfig } from "../config.js";
import type { WorkUnit } from "../scheduler.js";

export interface ProbeContext {
  study: StudyConfig;
  probes: ProbesConfig;
  repoRoot: string;           // repo root for resolving corpus paths
  sandbox: SandboxRunner;
  now: () => Date;
}

export interface ProbeStrategy {
  family: "bench" | "greedy" | "logprob" | "context";
  plan(ctx: ProbeContext, providerIds: string[]): WorkUnit[];
  execute(unit: WorkUnit, adapter: OpenAICompatibleAdapter, ctx: ProbeContext): Promise<Canonical[]>;
}

/** Shared evidence-record builder: every family produces this shell. */
export function baseRecord(
  ctx: ProbeContext,
  unit: WorkUnit,
  adapterCfg: { id: string; baseUrl: string; modelSlug: string },
  resp: {
    status: string; httpStatus: number | null; finishReason: string | null;
    modelReported: string | null; latencyMs: number; attempts: number; error: string | null;
    usage: { promptTokens: number | null; completionTokens: number | null };
  }
): Record<string, Canonical> {
  return {
    v: 1,
    kind: "generation",
    ts: ctx.now().toISOString(),
    study: ctx.study.studyId,
    probe: unit.probe,
    unit_key: unit.key,
    provider: adapterCfg.id,
    endpoint: adapterCfg.baseUrl,
    model_claimed: adapterCfg.modelSlug,
    model_reported: resp.modelReported,      // METHODOLOGY section 3: per-request version record
    response_status: resp.status,
    http_status: resp.httpStatus,
    finish_reason: resp.finishReason,
    latency_ms: resp.latencyMs,
    attempts: resp.attempts,
    error: resp.error,
    usage_prompt_tokens: resp.usage.promptTokens,
    usage_completion_tokens: resp.usage.completionTokens,
  };
}
