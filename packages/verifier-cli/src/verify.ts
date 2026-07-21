/**
 * Independent verification of a published Invigil evidence bundle.
 * Anyone can run this against the public data -- it is the product demo
 * embedded in the study (METHODOLOGY section 7).
 *
 * Checks, in order:
 *  1. every evidence line is byte-canonical (tamper at rest is visible)
 *  2. recomputed daily Merkle roots == published roots.json
 *  3. every receipt signature verifies, and each receipt leaf exists in evidence
 *  4. (optional, --rpc) each daily root matches StudyAnchor.anchoredRoot(label) on-chain
 * The chain check uses a raw eth_call with a hand-rolled ABI encoding --
 * deliberately: a verifier you can audit in one sitting, with no web3 dependency.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  isCanonicalLine, leafHashOfLine, toHex, buildTree, keccak256, utf8,
  verifyReceipt, type Receipt,
} from "@invigil/core";

export interface CheckResult { name: string; ok: boolean; detail: string; }

export function verifyEvidenceDir(dataDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const evidenceDir = join(dataDir, "evidence");
  const rootsPath = join(dataDir, "roots.json");
  if (!existsSync(rootsPath)) return [{ name: "roots.json", ok: false, detail: "missing" }];
  const published: Record<string, { root: string; count: number }> = JSON.parse(readFileSync(rootsPath, "utf8"));

  const files = readdirSync(evidenceDir).filter((f) => f.endsWith(".jsonl")).sort();
  const leavesByDate = new Map<string, Set<string>>();

  for (const f of files) {
    const date = f.slice(0, 10);
    const lines = readFileSync(join(evidenceDir, f), "utf8").split("\n").filter((l) => l.length > 0);

    let nonCanonical = 0;
    for (const l of lines) if (!isCanonicalLine(l)) nonCanonical++;
    results.push({
      name: `canonical ${date}`,
      ok: nonCanonical === 0,
      detail: nonCanonical === 0 ? `${lines.length} lines byte-canonical` : `${nonCanonical} NON-CANONICAL lines`,
    });

    const leaves = lines.map((l) => leafHashOfLine(l));
    leavesByDate.set(date, new Set(leaves.map((x) => toHex(x))));
    const root = toHex(buildTree(leaves).root);
    const pub = published[date];
    results.push({
      name: `root ${date}`,
      ok: !!pub && pub.root === root && pub.count === lines.length,
      detail: pub ? (pub.root === root ? `matches ${root}` : `MISMATCH computed ${root} != published ${pub.root}`) : "no published root",
    });
  }

  const receiptsDir = join(dataDir, "receipts");
  if (existsSync(receiptsDir)) {
    for (const f of readdirSync(receiptsDir).filter((x) => x.endsWith(".jsonl")).sort()) {
      const date = f.slice(0, 10);
      const receipts: Receipt[] = readFileSync(join(receiptsDir, f), "utf8")
        .split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      let badSig = 0, orphan = 0;
      const dayLeaves = leavesByDate.get(date) ?? new Set<string>();
      for (const r of receipts) {
        if (!verifyReceipt(r)) badSig++;
        if (!dayLeaves.has(r.leaf)) orphan++;
      }
      results.push({
        name: `receipts ${date}`,
        ok: badSig === 0 && orphan === 0,
        detail: badSig + orphan === 0 ? `${receipts.length} signatures valid, all leaves present`
          : `${badSig} bad signatures, ${orphan} receipts without matching evidence`,
      });
    }
  }
  return results;
}

/** anchoredRoot(bytes32) selector + arg, no ABI library. */
export async function chainRoot(rpcUrl: string, contract: string, label: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const selector = toHex(keccak256(utf8("anchoredRoot(bytes32)"))).slice(2, 10);
  const arg = toHex(keccak256(utf8(label))).slice(2);
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data: "0x" + selector + arg }, "latest"] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`rpc: ${j.error.message}`);
  return j.result as string;
}

export async function verifyAnchors(dataDir: string, rpcUrl: string, contract: string): Promise<CheckResult[]> {
  const published: Record<string, { root: string }> = JSON.parse(readFileSync(join(dataDir, "roots.json"), "utf8"));
  const out: CheckResult[] = [];
  for (const [date, v] of Object.entries(published)) {
    const onchain = await chainRoot(rpcUrl, contract, `day:${date}`);
    out.push({
      name: `anchor day:${date}`,
      ok: onchain.toLowerCase() === v.root.toLowerCase(),
      detail: onchain.toLowerCase() === v.root.toLowerCase() ? `on-chain matches ${v.root}` : `MISMATCH on-chain ${onchain} != local ${v.root}`,
    });
  }
  return out;
}
