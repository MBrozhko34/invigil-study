import { z } from "zod";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const StudyConfigSchema = z.object({
  studyId: z.string(),
  model: z.object({
    name: z.string(),
    hfRevision: z.string(),          // pinned weight artifact -- METHODOLOGY section 2
  }),
  methodologyHash: z.string().default("0x" + "00".repeat(32)), // filled at freeze
  seed: z.number().int(),            // drives deterministic unit shuffling
  scheduleWindowsUtc: z.array(z.object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24) })).min(1),
  budgetGbpCap: z.number().int(),
});
export type StudyConfig = z.infer<typeof StudyConfigSchema>;

export const ProbesConfigSchema = z.object({
  bench: z.object({
    tasksDirs: z.array(z.string()),  // tasks/public + tasks/private
    k: z.number().int().min(1),      // repetitions per task (METHODOLOGY: k=3)
    minGapHours: z.number().min(0),  // >=6h spacing between reps (caching mitigation)
    maxTokens: z.number().int(),
    sandboxTimeoutS: z.number().int(),
  }),
  greedy: z.object({ promptsFile: z.string(), maxTokens: z.number().int() }),
  logprob: z.object({ promptsFile: z.string() }),
  context: z.object({
    depthsPct: z.array(z.number().int().min(1).max(100)),
    trialsPerDepth: z.number().int().min(1),
    maxContextTokens: z.number().int(), // cost cap; min(advertised, this)
  }),
  thresholds: z.object({
    functionalGapPp: z.number(),     // 3 percentage points
    alpha: z.string(),               // "0.01" decimal string
  }),
});
export type ProbesConfig = z.infer<typeof ProbesConfigSchema>;

export function loadStudyConfig(path: string): StudyConfig {
  return StudyConfigSchema.parse(parseYaml(readFileSync(path, "utf8")));
}
export function loadProbesConfig(path: string): ProbesConfig {
  return ProbesConfigSchema.parse(parseYaml(readFileSync(path, "utf8")));
}
