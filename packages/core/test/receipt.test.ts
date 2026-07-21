import { test } from "node:test";
import assert from "node:assert/strict";
import { makeReceipt, verifyReceipt } from "../src/receipt.js";
import { randomPrivateKey, publicKeyOf } from "../src/signing.js";
import { canonicalize } from "../src/canonicalJson.js";

test("receipt signs and verifies; tamper breaks it", () => {
  const priv = randomPrivateKey();
  const pub = publicKeyOf(priv);
  const line = canonicalize({ probe: "bench", provider: "alpha", ts: "2026-07-14T00:00:00Z" });
  const r = makeReceipt(line, "0x" + "11".repeat(32), priv, pub, () => new Date("2026-07-14T12:00:00Z"));
  assert.equal(verifyReceipt(r), true);
  const tampered = { ...r, leaf: "0x" + "22".repeat(32) };
  assert.equal(verifyReceipt(tampered), false);
});
