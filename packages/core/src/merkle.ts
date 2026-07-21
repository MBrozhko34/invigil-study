/**
 * Sorted-pair Merkle tree over keccak256, matching the convention committed
 * in METHODOLOGY.md section 7 (and the CS907 dissertation implementation):
 *   parent = keccak256( min(a,b) || max(a,b) )  -- bytewise lexicographic order
 *   odd node at a layer is paired with itself
 * Sorted pairing removes left/right ambiguity across implementations; the
 * verifier CLI reimplements nothing -- it imports this exact module.
 */
import { keccak256 } from "./keccak.js";

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

export function parent(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const buf = new Uint8Array(lo.length + hi.length);
  buf.set(lo, 0);
  buf.set(hi, lo.length);
  return keccak256(buf);
}

export interface MerkleTree {
  root: Uint8Array;
  layers: Uint8Array[][]; // layers[0] = leaves
}

export function buildTree(leaves: Uint8Array[]): MerkleTree {
  if (leaves.length === 0) throw new Error("merkle: empty leaf set");
  let layer = leaves.slice();
  const layers: Uint8Array[][] = [layer];
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const l = layer[i];
      const r = i + 1 < layer.length ? layer[i + 1] : layer[i]; // odd: pair with self
      next.push(parent(l, r));
    }
    layer = next;
    layers.push(layer);
  }
  return { root: layer[0], layers };
}

export function proofFor(tree: MerkleTree, leafIndex: number): Uint8Array[] {
  const proof: Uint8Array[] = [];
  let idx = leafIndex;
  for (let d = 0; d < tree.layers.length - 1; d++) {
    const layer = tree.layers[d];
    const sib = idx ^ 1;
    proof.push(sib < layer.length ? layer[sib] : layer[idx]); // odd: self
    idx = idx >> 1;
  }
  return proof;
}

export function verifyProof(leaf: Uint8Array, proof: Uint8Array[], root: Uint8Array): boolean {
  let h = leaf;
  for (const p of proof) h = parent(h, p);
  return compareBytes(h, root) === 0;
}
