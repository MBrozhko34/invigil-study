import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, isCanonicalLine } from "../src/canonicalJson.js";

test("sorts keys, no whitespace", () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
});
test("nested objects sorted recursively", () => {
  assert.equal(canonicalize({ z: { y: 2, x: 1 } }), '{"z":{"x":1,"y":2}}');
});
test("rejects floats", () => {
  assert.throws(() => canonicalize({ a: 1.5 }), /non-integer/);
});
test("rejects undefined values", () => {
  assert.throws(() => canonicalize({ a: undefined }), /undefined/);
});
test("string escapes are stable JSON escapes", () => {
  assert.equal(canonicalize({ s: 'a"b\n' }), '{"s":"a\\"b\\n"}');
});
test("round-trip check accepts canonical, rejects non-canonical", () => {
  assert.equal(isCanonicalLine('{"a":1,"b":2}'), true);
  assert.equal(isCanonicalLine('{"b":2,"a":1}'), false);
  assert.equal(isCanonicalLine('{"a": 1}'), false);
  assert.equal(isCanonicalLine("not json"), false);
});
