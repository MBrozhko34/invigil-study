import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toHex, utf8 } from "@invigil/core";

export interface BenchTask { id: string; prompt: string; entry_point: string; tests: string[]; }
export interface PromptItem { id: string; prompt: string; }

export function loadBenchTasks(repoRoot: string, dirs: string[]): BenchTask[] {
  const tasks: BenchTask[] = [];
  for (const d of dirs) {
    const abs = join(repoRoot, d);
    let files: string[] = [];
    try { files = readdirSync(abs).filter((f) => f.endsWith(".json")).sort(); } catch { continue; }
    for (const f of files) tasks.push(JSON.parse(readFileSync(join(abs, f), "utf8")));
  }
  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.id)) throw new Error(`duplicate task id ${t.id}`);
    ids.add(t.id);
  }
  return tasks;
}

export function loadPrompts(repoRoot: string, file: string): PromptItem[] {
  return readFileSync(join(repoRoot, file), "utf8")
    .split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}

export function sha(text: string): string { return toHex(keccak256(utf8(text))); }
