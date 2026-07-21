/**
 * Context-window probe (METHODOLOGY section 5.4): needle retrieval at depth
 * fractions of the ADVERTISED context. Needle codes are deterministic from the
 * study seed, so the corpus is reproducible but not guessable in advance.
 */
import type { OpenAICompatibleAdapter } from "@invigil/providers";
import type { Canonical } from "@invigil/core";
import type { ProbeContext, ProbeStrategy } from "./types.js";
import { baseRecord } from "./types.js";
import type { WorkUnit } from "../scheduler.js";
import { mulberry32 } from "../scheduler.js";
import { sha } from "./corpus.js";

const FILLER =
  "The quarterly logistics review covered warehouse throughput, fleet utilisation, and seasonal demand planning across all regions. ";
const CHARS_PER_TOKEN = 4;

function needleCode(seed: number, depth: number, trial: number): string {
  const rand = mulberry32(seed ^ (depth * 7919) ^ (trial * 104729));
  return Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rand() * 32)]).join("");
}

export function buildHaystack(totalTokens: number, depthPct: number, code: string): string {
  const totalChars = totalTokens * CHARS_PER_TOKEN;
  const needle = ` The vault access code is ${code}. `;
  const bodyChars = Math.max(0, totalChars - needle.length - 200);
  const before = Math.floor((bodyChars * depthPct) / 100);
  const rep = (n: number) => FILLER.repeat(Math.ceil(n / FILLER.length)).slice(0, n);
  return (
    rep(before) + needle + rep(bodyChars - before) +
    "\n\nQuestion: What is the vault access code mentioned above? Answer with the code only."
  );
}

export class ContextProbe implements ProbeStrategy {
  family = "context" as const;

  plan(ctx: ProbeContext, providerIds: string[]): WorkUnit[] {
    const units: WorkUnit[] = [];
    for (const p of providerIds)
      for (const depth of ctx.probes.context.depthsPct)
        for (let trial = 0; trial < ctx.probes.context.trialsPerDepth; trial++)
          units.push({
            key: `context/${p}/d${depth}/t${trial}`,
            probe: "context",
            providerId: p,
            payload: { depth, trial },
          });
    return units;
  }

  async execute(unit: WorkUnit, adapter: OpenAICompatibleAdapter, ctx: ProbeContext): Promise<Canonical[]> {
    const depth = unit.payload.depth as number;
    const trial = unit.payload.trial as number;
    const budget = Math.min(adapter.cfg.advertised.contextLength, ctx.probes.context.maxContextTokens);
    const promptTokens = Math.floor(budget * 0.9); // leave headroom for the answer
    const code = needleCode(ctx.study.seed, depth, trial);
    const prompt = buildHaystack(promptTokens, depth, code);
    const resp = await adapter.complete({ prompt, maxTokens: 32, seed: ctx.study.seed });
    return [{
      ...baseRecord(ctx, unit, adapter.cfg, resp),
      depth_pct: depth,
      trial,
      prompt_tokens_target: promptTokens,
      prompt_sha: sha(prompt),
      needle_code: code,
      text: resp.text,
      retrieved: resp.status === "ok" && resp.text.toUpperCase().includes(code),
    }];
  }
}
