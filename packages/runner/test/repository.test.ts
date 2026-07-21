import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceRepository } from "../src/repository.js";
import { randomPrivateKey, publicKeyOf, verifyReceipt, leafHashOfLine, toHex, canonicalize } from "@invigil/core";

const rec = (ts: string, i: number) => ({ v: 1, ts, probe: "greedy", provider: "p", n: i });

test("append writes canonical lines; merkleize produces stable root", () => {
  const dir = mkdtempSync(join(tmpdir(), "sen-"));
  const repo = new EvidenceRepository(dir);
  const r1 = repo.append(rec("2026-07-14T10:00:00.000Z", 1));
  const r2 = repo.append(rec("2026-07-14T10:00:01.000Z", 2));
  assert.equal(r1.date, "2026-07-14");
  assert.equal(r2.index, 1);
  const { root, count } = repo.merkleize("2026-07-14");
  assert.equal(count, 2);
  // rebuild from raw file -> identical root (what the verifier does)
  const lines = readFileSync(join(dir, "evidence", "2026-07-14.jsonl"), "utf8").trim().split("\n");
  assert.equal(toHex(leafHashOfLine(lines[0])), r1.leaf);
  const again = new EvidenceRepository(dir).merkleize("2026-07-14");
  assert.equal(again.root, root);
  // roots.json must round-trip with nested fields intact (regression: array-replacer bug)
  const published = JSON.parse(readFileSync(join(dir, "roots.json"), "utf8"));
  assert.equal(published["2026-07-14"].root, root);
  assert.equal(published["2026-07-14"].count, 2);
});

test("receipts are signed and verifiable when signing key present", () => {
  const dir = mkdtempSync(join(tmpdir(), "sen-"));
  const priv = randomPrivateKey();
  const repo = new EvidenceRepository(dir, { privateKey: priv, publicKey: publicKeyOf(priv), methodologyHash: "0x" + "ab".repeat(32) });
  repo.append(rec("2026-07-14T10:00:00.000Z", 1));
  const receipt = JSON.parse(readFileSync(join(dir, "receipts", "2026-07-14.jsonl"), "utf8").trim());
  assert.equal(verifyReceipt(receipt), true);
});

test("merkleize refuses non-canonical lines (tamper detection at source)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sen-"));
  const repo = new EvidenceRepository(dir);
  repo.append(rec("2026-07-14T10:00:00.000Z", 1));
  // simulate tampering: append a line with keys out of canonical (sorted) order
  appendFileSync(join(dir, "evidence", "2026-07-14.jsonl"), '{"v":1,"ts":"2026-07-14T11:00:00.000Z"}\n');
  assert.throws(() => repo.merkleize("2026-07-14"), /non-canonical/);
});

test("floats are rejected before they ever reach disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "sen-"));
  const repo = new EvidenceRepository(dir);
  assert.throws(() => repo.append({ v: 1, ts: "2026-07-14T10:00:00.000Z", price: 0.27 } as any), /non-integer/);
});
