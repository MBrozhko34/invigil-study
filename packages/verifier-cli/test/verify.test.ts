import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyEvidenceDir, chainRoot } from "../src/verify.js";
import { canonicalize, leafHashOfLine, toHex, buildTree, keccak256, utf8 } from "@invigil/core";

function bundle(): { dir: string; lines: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "sen-ver-"));
  mkdirSync(join(dir, "evidence"));
  const lines = [1, 2, 3].map((i) => canonicalize({ n: i, ts: "2026-07-14T10:00:00.000Z", v: 1 }));
  writeFileSync(join(dir, "evidence", "2026-07-14.jsonl"), lines.join("\n") + "\n");
  const root = toHex(buildTree(lines.map((l) => leafHashOfLine(l))).root);
  writeFileSync(join(dir, "roots.json"), JSON.stringify({ "2026-07-14": { root, count: 3 } }));
  return { dir, lines };
}

test("clean bundle passes all checks", () => {
  const { dir } = bundle();
  assert.ok(verifyEvidenceDir(dir).every((r) => r.ok));
});

test("appended line breaks the root check (tamper detected)", () => {
  const { dir } = bundle();
  appendFileSync(join(dir, "evidence", "2026-07-14.jsonl"), canonicalize({ n: 4, ts: "2026-07-14T11:00:00.000Z", v: 1 }) + "\n");
  const results = verifyEvidenceDir(dir);
  assert.ok(results.some((r) => !r.ok && r.name.startsWith("root")));
});

test("edited line breaks canonical or root check", () => {
  const { dir, lines } = bundle();
  const edited = lines.slice();
  edited[1] = edited[1].replace('"n":2', '"n":99');
  writeFileSync(join(dir, "evidence", "2026-07-14.jsonl"), edited.join("\n") + "\n");
  const results = verifyEvidenceDir(dir);
  assert.ok(results.some((r) => !r.ok));
});

test("eth_call payload is correctly hand-rolled", async () => {
  let captured: any = null;
  const fakeFetch: typeof fetch = async (_url: any, init: any) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" + "ab".repeat(32) }), { status: 200 });
  };
  const root = await chainRoot("http://rpc", "0x" + "11".repeat(20), "day:2026-07-14", fakeFetch);
  assert.equal(root, "0x" + "ab".repeat(32));
  const selector = toHex(keccak256(utf8("anchoredRoot(bytes32)"))).slice(2, 10);
  const arg = toHex(keccak256(utf8("day:2026-07-14"))).slice(2);
  assert.equal(captured.params[0].data, "0x" + selector + arg);
  assert.equal(captured.method, "eth_call");
});
