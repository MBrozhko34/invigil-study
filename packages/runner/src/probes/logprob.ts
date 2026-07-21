/** Logprob divergence (METHODOLOGY section 5.3). N/A where the provider lacks the capability -- never penalized. */
import type { OpenAICompatibleAdapter } from "@invigil/providers";
import type { Canonical } from "@invigil/core";
import type { ProbeContext, ProbeStrategy } from "./types.js";
import { baseRecord } from "./types.js";
import type { WorkUnit } from "../scheduler.js";
import { loadPrompts, sha } from "./corpus.js";

export class LogprobProbe implements ProbeStrategy {
  family = "logprob" as const;

  plan(ctx: ProbeContext, providerIds: string[]): WorkUnit[] {
    const prompts = loadPrompts(ctx.repoRoot, ctx.probes.logprob.promptsFile);
    const units: WorkUnit[] = [];
    for (const p of providerIds)
      for (const item of prompts)
        units.push({ key: `logprob/${p}/${item.id}`, probe: "logprob", providerId: p, payload: { promptId: item.id } });
    return units;
  }

  async execute(unit: WorkUnit, adapter: OpenAICompatibleAdapter, ctx: ProbeContext): Promise<Canonical[]> {
    if (!adapter.cfg.capabilities.logprobs) {
      return [{
        v: 1, kind: "generation", ts: ctx.now().toISOString(), study: ctx.study.studyId,
        probe: "logprob", unit_key: unit.key, provider: adapter.cfg.id, endpoint: adapter.cfg.baseUrl,
        model_claimed: adapter.cfg.modelSlug, model_reported: null,
        response_status: "na_capability", http_status: null, finish_reason: null,
        latency_ms: 0, attempts: 0, error: null,
        usage_prompt_tokens: null, usage_completion_tokens: null,
        prompt_id: unit.payload.promptId as string,
      }];
    }
    const prompts = loadPrompts(ctx.repoRoot, ctx.probes.logprob.promptsFile);
    const item = prompts.find((x) => x.id === unit.payload.promptId)!;
    const resp = await adapter.complete({ prompt: item.prompt, maxTokens: 1, wantLogprobs: true, seed: ctx.study.seed });
    return [{
      ...baseRecord(ctx, unit, adapter.cfg, resp),
      prompt_id: item.id,
      prompt_sha: sha(item.prompt),
      text: resp.text,
      logprobs: (resp.logprobs ?? []) as unknown as Canonical,
    }];
  }
}
