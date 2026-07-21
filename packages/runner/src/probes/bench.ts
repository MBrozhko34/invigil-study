/**
 * Functional coding benchmark (METHODOLOGY section 5.1).
 * Unit = (task, provider, rep) with rep r depending on rep r-1 at >= minGapHours
 * (cache mitigation). Emits TWO records per unit: generation + execution.
 */
import type { OpenAICompatibleAdapter } from "@invigil/providers";
import type { Canonical } from "@invigil/core";
import type { ProbeContext, ProbeStrategy } from "./types.js";
import { baseRecord } from "./types.js";
import type { WorkUnit } from "../scheduler.js";
import { loadBenchTasks, sha } from "./corpus.js";
import { extractPython } from "./extract.js";

const INSTRUCTION =
  "Complete the following Python function. Reply with a single Python code block containing " +
  "the complete function definition and nothing else.\n\n";

export class BenchProbe implements ProbeStrategy {
  family = "bench" as const;

  plan(ctx: ProbeContext, providerIds: string[]): WorkUnit[] {
    const tasks = loadBenchTasks(ctx.repoRoot, ctx.probes.bench.tasksDirs);
    const units: WorkUnit[] = [];
    for (const p of providerIds)
      for (const t of tasks)
        for (let rep = 0; rep < ctx.probes.bench.k; rep++)
          units.push({
            key: `bench/${p}/${t.id}/r${rep}`,
            probe: "bench",
            providerId: p,
            dependsOnKey: rep > 0 ? `bench/${p}/${t.id}/r${rep - 1}` : undefined,
            minGapHours: rep > 0 ? ctx.probes.bench.minGapHours : undefined,
            payload: { taskId: t.id, rep },
          });
    return units;
  }

  async execute(unit: WorkUnit, adapter: OpenAICompatibleAdapter, ctx: ProbeContext): Promise<Canonical[]> {
    const tasks = loadBenchTasks(ctx.repoRoot, ctx.probes.bench.tasksDirs);
    const task = tasks.find((t) => t.id === unit.payload.taskId);
    if (!task) throw new Error(`unknown task ${unit.payload.taskId}`);
    const prompt = INSTRUCTION + task.prompt;

    const resp = await adapter.complete({ prompt, maxTokens: ctx.probes.bench.maxTokens, seed: ctx.study.seed });
    const gen = {
      ...baseRecord(ctx, unit, adapter.cfg, resp),
      task_id: task.id,
      rep: unit.payload.rep as number,
      prompt_sha: sha(prompt),
      text: resp.text,
    };

    if (resp.status !== "ok") return [gen];

    const code = extractPython(resp.text);
    const verdict = await ctx.sandbox.run({ code, tests: task.tests, timeoutS: ctx.probes.bench.sandboxTimeoutS });
    const exec: Record<string, Canonical> = {
      v: 1,
      kind: "execution",
      ts: ctx.now().toISOString(),
      study: ctx.study.studyId,
      probe: "bench",
      unit_key: unit.key,
      provider: adapter.cfg.id,
      task_id: task.id,
      rep: unit.payload.rep as number,
      gen_prompt_sha: sha(prompt),
      code_sha: sha(code),
      sandbox_mode: verdict.mode,
      exec_ok: verdict.ok,
      exec_error: verdict.error,
      passed: verdict.passed,
      total: verdict.total,
      results: verdict.results,
    };
    return [gen, exec];
  }
}
