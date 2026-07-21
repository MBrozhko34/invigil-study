#!/usr/bin/env python3
"""
In-sandbox test harness. Reads JSON from stdin:
  { "code": "<candidate python>", "tests": ["assert f(1)==2", ...], "timeout_s": 5 }
Writes JSON verdict to stdout:
  { "ok": bool, "error": str|null, "results": [bool,...], "passed": int, "total": int }
Runs inside a network-less, resource-capped container in production
(SANDBOX_MODE=docker); the local mode exists for CI/dev only.
"""
import json, signal, sys


def main() -> None:
    payload = json.load(sys.stdin)
    code = payload["code"]
    tests = payload["tests"]
    timeout_s = int(payload.get("timeout_s", 5))

    ns: dict = {"__name__": "__candidate__"}
    try:
        exec(compile(code, "<candidate>", "exec"), ns)  # noqa: S102 -- the point of the sandbox
    except BaseException as e:  # candidate code may raise anything, incl. SystemExit
        print(json.dumps({"ok": False, "error": f"exec: {type(e).__name__}: {e}", "results": [], "passed": 0, "total": len(tests)}))
        return

    results = []
    for t in tests:
        def _alarm(signum, frame):  # noqa: ARG001
            raise TimeoutError("test timeout")
        signal.signal(signal.SIGALRM, _alarm)
        signal.alarm(timeout_s)
        try:
            exec(compile(t, "<test>", "exec"), ns)  # noqa: S102
            results.append(True)
        except BaseException:
            results.append(False)
        finally:
            signal.alarm(0)

    print(json.dumps({"ok": True, "error": None, "results": results, "passed": sum(results), "total": len(results)}))


if __name__ == "__main__":
    main()
