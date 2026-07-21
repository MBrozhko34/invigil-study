/**
 * Eligibility rules (METHODOLOGY section 3):
 *  - unit executes only inside declared UTC time windows
 *  - bench rep r depends on rep r-1 of the same (task, provider) completing
 *    >= minGapHours earlier (provider-cache mitigation)
 * plus a deterministic seeded shuffle so probe ordering is randomized but
 * reproducible from the study seed.
 */
import type { StudyConfig } from "./config.js";
import type { Checkpoint } from "./checkpoint.js";

export interface WorkUnit {
  key: string;                 // stable id: probe/provider/item/rep
  probe: string;
  providerId: string;
  dependsOnKey?: string;
  minGapHours?: number;
  payload: Record<string, unknown>;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function inWindow(study: StudyConfig, now: Date): boolean {
  const h = now.getUTCHours();
  return study.scheduleWindowsUtc.some((w) => h >= w.startHour && h < w.endHour);
}

export type Eligibility = { eligible: true } | { eligible: false; reason: string; notBefore?: Date };

export function eligibility(u: WorkUnit, cp: Checkpoint, study: StudyConfig, now: Date): Eligibility {
  if (cp.isDone(u.key)) return { eligible: false, reason: "done" };
  if (!inWindow(study, now)) return { eligible: false, reason: "outside-window" };
  if (u.dependsOnKey) {
    const depAt = cp.completedAt(u.dependsOnKey);
    if (!depAt) return { eligible: false, reason: "dep-pending" };
    const gapMs = (u.minGapHours ?? 0) * 3600_000;
    const notBefore = new Date(depAt.getTime() + gapMs);
    if (now < notBefore) return { eligible: false, reason: "gap", notBefore };
  }
  return { eligible: true };
}
