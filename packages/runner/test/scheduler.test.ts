import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eligibility, seededShuffle, inWindow, type WorkUnit } from "../src/scheduler.js";
import { Checkpoint } from "../src/checkpoint.js";
import type { StudyConfig } from "../src/config.js";

const study: StudyConfig = {
  studyId: "t", model: { name: "m", hfRevision: "r" },
  methodologyHash: "0x" + "00".repeat(32), seed: 42,
  scheduleWindowsUtc: [{ startHour: 0, endHour: 24 }], budgetGbpCap: 800,
};

test("seeded shuffle is deterministic and permutes", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  const a = seededShuffle(items, 42);
  const b = seededShuffle(items, 42);
  const c = seededShuffle(items, 43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
});

test("gap rule: rep 1 blocked until 6h after rep 0", () => {
  const cp = new Checkpoint(join(mkdtempSync(join(tmpdir(), "sen-")), "cp.json"));
  const u0: WorkUnit = { key: "bench/p/t/r0", probe: "bench", providerId: "p", payload: {} };
  const u1: WorkUnit = { key: "bench/p/t/r1", probe: "bench", providerId: "p", dependsOnKey: u0.key, minGapHours: 6, payload: {} };
  const t0 = new Date("2026-07-14T10:00:00Z");

  assert.equal(eligibility(u1, cp, study, t0).eligible, false); // dep pending
  cp.markDone(u0.key, t0);
  const at3h = eligibility(u1, cp, study, new Date("2026-07-14T13:00:00Z"));
  assert.equal(at3h.eligible, false);
  assert.equal((at3h as any).notBefore.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(eligibility(u1, cp, study, new Date("2026-07-14T16:00:01Z")).eligible, true);
});

test("time windows gate execution", () => {
  const windowed: StudyConfig = { ...study, scheduleWindowsUtc: [{ startHour: 6, endHour: 10 }] };
  assert.equal(inWindow(windowed, new Date("2026-07-14T07:30:00Z")), true);
  assert.equal(inWindow(windowed, new Date("2026-07-14T11:00:00Z")), false);
});

test("checkpoint survives reload (resumability)", () => {
  const p = join(mkdtempSync(join(tmpdir(), "sen-")), "cp.json");
  new Checkpoint(p).markDone("a", new Date("2026-07-14T10:00:00Z"));
  assert.equal(new Checkpoint(p).isDone("a"), true);
});
