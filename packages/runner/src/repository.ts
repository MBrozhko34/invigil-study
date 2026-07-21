/**
 * Evidence repository. Source of truth = append-only JSONL of canonical lines,
 * one file per UTC day: data/evidence/YYYY-MM-DD.jsonl
 * Receipts mirror it in data/receipts/YYYY-MM-DD.jsonl.
 * Roots land in data/roots.json at merkleize time.
 *
 * DEVIATION from Phase 1 plan (approved rationale in build log): SQLite dropped.
 * Analysis (pandas) reads JSONL natively, the verifier needs raw lines anyway,
 * and removing better-sqlite3 keeps the public repo free of native builds.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalize, isCanonicalLine, leafHashOfLine, toHex, buildTree,
  makeReceipt, type Canonical, type Receipt,
} from "@invigil/core";

export interface AppendResult { date: string; index: number; leaf: string; }

export class EvidenceRepository {
  readonly evidenceDir: string;
  readonly receiptsDir: string;
  readonly rootsPath: string;
  private counts = new Map<string, number>();

  constructor(readonly dataDir: string,
              private signing?: { privateKey: Uint8Array; publicKey: Uint8Array; methodologyHash: string }) {
    this.evidenceDir = join(dataDir, "evidence");
    this.receiptsDir = join(dataDir, "receipts");
    this.rootsPath = join(dataDir, "roots.json");
    mkdirSync(this.evidenceDir, { recursive: true });
    mkdirSync(this.receiptsDir, { recursive: true });
    for (const d of this.dates()) this.counts.set(d, this.readLines(d).length);
  }

  append(record: Canonical, now: () => Date = () => new Date()): AppendResult {
    const line = canonicalize(record);
    const date = ((record as any).ts as string).slice(0, 10);
    appendFileSync(join(this.evidenceDir, date + ".jsonl"), line + "\n");
    const index = (this.counts.get(date) ?? 0);
    this.counts.set(date, index + 1);
    const leaf = toHex(leafHashOfLine(line));
    if (this.signing) {
      const receipt = makeReceipt(line, this.signing.methodologyHash, this.signing.privateKey, this.signing.publicKey, now);
      appendFileSync(join(this.receiptsDir, date + ".jsonl"), JSON.stringify(receipt) + "\n");
    }
    return { date, index, leaf };
  }

  dates(): string[] {
    if (!existsSync(this.evidenceDir)) return [];
    return readdirSync(this.evidenceDir).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, 10)).sort();
  }

  readLines(date: string): string[] {
    const p = join(this.evidenceDir, date + ".jsonl");
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8").split("\n").filter((l) => l.length > 0);
  }

  /** Recompute the Merkle root of a day's file. Fails loudly on any non-canonical line. */
  merkleize(date: string): { root: string; count: number } {
    const lines = this.readLines(date);
    if (lines.length === 0) throw new Error(`no evidence for ${date}`);
    lines.forEach((l, i) => {
      if (!isCanonicalLine(l)) throw new Error(`non-canonical evidence line ${date}:${i}`);
    });
    const tree = buildTree(lines.map((l) => leafHashOfLine(l)));
    const root = toHex(tree.root);
    const roots = this.readRoots();
    roots[date] = { root, count: lines.length };
    const sorted = Object.fromEntries(Object.keys(roots).sort().map((k) => [k, roots[k]]));
    const tmp = this.rootsPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(sorted, null, 2));
    renameSync(tmp, this.rootsPath);
    return { root, count: lines.length };
  }

  readRoots(): Record<string, { root: string; count: number }> {
    if (!existsSync(this.rootsPath)) return {};
    return JSON.parse(readFileSync(this.rootsPath, "utf8"));
  }
}
