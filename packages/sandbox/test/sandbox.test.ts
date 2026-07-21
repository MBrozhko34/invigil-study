import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalSandbox } from "../src/runner.js";

const sb = new LocalSandbox();

test("passing solution: all tests pass", async () => {
  const v = await sb.run({ code: "def add(a,b):\n    return a+b\n", tests: ["assert add(1,2)==3", "assert add(-1,1)==0"], timeoutS: 3 });
  assert.equal(v.ok, true);
  assert.equal(v.passed, 2);
  assert.equal(v.total, 2);
  assert.equal(v.mode, "local");
});

test("wrong solution: failures recorded per test", async () => {
  const v = await sb.run({ code: "def add(a,b):\n    return a-b\n", tests: ["assert add(1,2)==3", "assert add(0,0)==0"], timeoutS: 3 });
  assert.deepEqual(v.results, [false, true]);
});

test("syntax error: ok=false, zero passed", async () => {
  const v = await sb.run({ code: "def add(a,b) return", tests: ["assert True"], timeoutS: 3 });
  assert.equal(v.ok, false);
  assert.match(v.error ?? "", /exec/);
});

test("infinite loop in a test is cut by the alarm", async () => {
  const v = await sb.run({ code: "def spin():\n    while True: pass\n", tests: ["spin()"], timeoutS: 1 });
  assert.equal(v.ok, true);
  assert.deepEqual(v.results, [false]);
});

test("candidate calling sys.exit does not kill the harness", async () => {
  const v = await sb.run({ code: "import sys\nsys.exit(1)\n", tests: ["assert True"], timeoutS: 2 });
  assert.equal(v.ok, false);
});
