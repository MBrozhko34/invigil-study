import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "../src/keccak.js";
import { toHex, utf8, fromHex } from "../src/hex.js";
import { buildTree, proofFor, verifyProof, parent, compareBytes } from "../src/merkle.js";

// Golden vector 1: keccak256 of empty input (universal constant)
test("keccak256 golden: empty input", () => {
  assert.equal(
    toHex(keccak256(new Uint8Array(0))),
    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
  );
});

// Golden vector 2: keccak256("hello") -- cross-checked against solidity keccak256(bytes("hello"))
test("keccak256 golden: 'hello'", () => {
  assert.equal(
    toHex(keccak256(utf8("hello"))),
    "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8"
  );
});

// Golden vector 3: sorted-pair parent matches the dissertation convention:
// keccak256(min||max). Computed independently: for leaves keccak("a"), keccak("b").
test("sorted-pair parent is order-invariant", () => {
  const a = keccak256(utf8("a"));
  const b = keccak256(utf8("b"));
  assert.equal(toHex(parent(a, b)), toHex(parent(b, a)));
  // and equals keccak(concat sorted)
  const [lo, hi] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const buf = new Uint8Array(64); buf.set(lo, 0); buf.set(hi, 32);
  assert.equal(toHex(parent(a, b)), toHex(keccak256(buf)));
});

test("tree of 1 leaf: root == leaf", () => {
  const leaf = keccak256(utf8("only"));
  const t = buildTree([leaf]);
  assert.equal(toHex(t.root), toHex(leaf));
  assert.equal(verifyProof(leaf, proofFor(t, 0), t.root), true);
});

test("odd leaf pairs with itself", () => {
  const leaves = ["x", "y", "z"].map((s) => keccak256(utf8(s)));
  const t = buildTree(leaves);
  const manual = parent(parent(leaves[0], leaves[1]), parent(leaves[2], leaves[2]));
  assert.equal(toHex(t.root), toHex(manual));
});

test("proofs verify for every leaf, fail for wrong leaf/root", () => {
  const leaves = Array.from({ length: 13 }, (_, i) => keccak256(utf8("leaf-" + i)));
  const t = buildTree(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const proof = proofFor(t, i);
    assert.equal(verifyProof(leaves[i], proof, t.root), true, `leaf ${i}`);
    const wrong = keccak256(utf8("tampered"));
    assert.equal(verifyProof(wrong, proof, t.root), false);
  }
});

test("root changes if any leaf changes (tamper evidence)", () => {
  const leaves = Array.from({ length: 8 }, (_, i) => keccak256(utf8("L" + i)));
  const r1 = buildTree(leaves).root;
  leaves[3] = keccak256(utf8("L3-tampered"));
  const r2 = buildTree(leaves).root;
  assert.notEqual(toHex(r1), toHex(r2));
});

test("pair-sort invariance property: swapping siblings preserves root", () => {
  const leaves = Array.from({ length: 4 }, (_, i) => keccak256(utf8("p" + i)));
  const t1 = buildTree([leaves[0], leaves[1], leaves[2], leaves[3]]).root;
  const t2 = buildTree([leaves[1], leaves[0], leaves[3], leaves[2]]).root;
  assert.equal(toHex(t1), toHex(t2)); // sibling order within a pair is irrelevant by construction
});
