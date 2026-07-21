/** Greedy-decoding divergence corpus (METHODOLOGY section 5.2): capture text at T=0; analysis compares to reference. */
import type { OpenAICompatibleAdapter } from "@invigil/providers";
import type { Canonical } from "@invigil/core";
import type { ProbeContext, ProbeStrategy } from "./types.js";
import { baseRecord } from "./types.js";
import type { WorkUnit } from "../scheduler.js";
import { loadPrompts, sha } from "./corpus.js";

export class GreedyProbe implements ProbeStrategy {
  family = "greedy" as const;

  plan(ctx: ProbeContext, providerIds: string[]): WorkUnit[] {
    const prompts = loadPrompts(ctx.repoRoot, ctx.probes.greedy.promptsFile);
    const units: WorkUnit[] = [];
    for (const p of providerIds)
      for (const item of prompts)
        units.push({ key: `greedy/${p}/${item.id}`, probe: "greedy", providerId: p, payload: { promptId: item.id } });
    return units;
  }

  async execute(unit: WorkUnit, adapter: OpenAICompatibleAdapter, ctx: ProbeContext): Promise<Canonical[]> {
    const prompts = loadPrompts(ctx.repoRoot, ctx.probes.greedy.promptsFile);
    const item = prompts.find((x) => x.id === unit.payload.promptId)!;
    const resp = await adapter.complete({ prompt: item.prompt, maxTokens: ctx.probes.greedy.maxTokens, seed: ctx.study.seed });
    return [{
      ...baseRecord(ctx, unit, adapter.cfg, resp),
      prompt_id: item.id,
      prompt_sha: sha(item.prompt),
      text: resp.text,
    }];
  }
}
