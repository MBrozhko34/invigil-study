/**
 * Audit-grade receipt schema (the "shared spine" -- forward-compatible with
 * compliance attestation). A receipt binds one evidence record to:
 *   - its canonical leaf hash
 *   - the study identity (methodology hash)
 *   - an Ed25519 signature by the study publisher
 * Batch fields (merkle root, proof, anchor tx) are attached at merkleize time.
 */
import { canonicalize, type Canonical } from "./canonicalJson.js";
import { keccak256 } from "./keccak.js";
import { toHex, fromHex, utf8 } from "./hex.js";
import { sign, verify } from "./signing.js";

export interface ReceiptCore {
  v: 1;
  leaf: string;              // 0x keccak256 of the canonical evidence line
  methodology: string;       // 0x keccak256 of frozen METHODOLOGY.md
  ts: string;                // ISO-8601 UTC, signing time
  signer: string;            // 0x ed25519 public key
}
export interface Receipt extends ReceiptCore {
  sig: string;               // 0x ed25519 signature over canonicalize(ReceiptCore)
  batch?: {
    date: string;            // YYYY-MM-DD evidence file
    index: number;           // leaf index within the file
    root: string;            // 0x merkle root of the day
    proof: string[];         // 0x sibling hashes
    anchorTx?: string;       // L2 tx hash once posted
  };
}

export function leafHashOfLine(canonicalLine: string): Uint8Array {
  return keccak256(utf8(canonicalLine));
}

export function makeReceipt(
  canonicalLine: string,
  methodologyHash: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  now: () => Date = () => new Date()
): Receipt {
  const core: ReceiptCore = {
    v: 1,
    leaf: toHex(leafHashOfLine(canonicalLine)),
    methodology: methodologyHash,
    ts: now().toISOString(),
    signer: toHex(publicKey),
  };
  const msg = utf8(canonicalize(core as unknown as Canonical));
  const sig = sign(msg, privateKey);
  return { ...core, sig: toHex(sig) };
}

export function verifyReceipt(r: Receipt): boolean {
  const core: ReceiptCore = { v: r.v, leaf: r.leaf, methodology: r.methodology, ts: r.ts, signer: r.signer };
  const msg = utf8(canonicalize(core as unknown as Canonical));
  return verify(fromHex(r.sig), msg, fromHex(r.signer));
}
