#!/usr/bin/env python3
"""Draft generator for the PRIVATE task corpus (METHODOLOGY section 5.1).
Produces parameterised variants of hand-written templates, each with a known
solution validated against its own tests before emission. Every generated task
REQUIRES human review before entering the corpus -- this tool drafts, you edit.

Private tasks are single-use: providers see them during collection, so every
leaderboard cycle regenerates the set with fresh parameters.

  python generator.py --n 120 --seed 20260714 --out ../tasks/private/
"""
import argparse, json, pathlib, random


def t_chunked_sum(rng: random.Random, i: int) -> dict:
    k = rng.randint(2, 5)
    return {
        "id": f"prv-{i:03d}",
        "prompt": (f"def chunked_sum(xs: list[int], k: int = {k}) -> list[int]:\n"
                   f"    \"\"\"Split xs into consecutive chunks of size {k} (last chunk may be shorter)\n"
                   f"    and return the sum of each chunk. chunked_sum([1,2,3,4,5], 2) -> [3, 7, 5]\"\"\""),
        "entry_point": "chunked_sum",
        "tests": [
            f"assert chunked_sum([1,2,3,4,5], {k}) == [sum([1,2,3,4,5][j:j+{k}]) for j in range(0, 5, {k})]",
            f"assert chunked_sum([], {k}) == []",
            f"assert chunked_sum(list(range(10)), {k}) == [sum(list(range(10))[j:j+{k}]) for j in range(0, 10, {k})]",
        ],
        "_solution": f"def chunked_sum(xs, k={k}):\n    return [sum(xs[j:j+k]) for j in range(0, len(xs), k)]",
    }


def t_dedupe_keep_last(rng: random.Random, i: int) -> dict:
    return {
        "id": f"prv-{i:03d}",
        "prompt": ("def dedupe_keep_last(xs: list[str]) -> list[str]:\n"
                   "    \"\"\"Remove duplicates keeping only the LAST occurrence of each value,\n"
                   "    preserving the order of those last occurrences.\n"
                   "    dedupe_keep_last(['a','b','a','c','b']) -> ['a','c','b']\"\"\""),
        "entry_point": "dedupe_keep_last",
        "tests": [
            "assert dedupe_keep_last(['a','b','a','c','b']) == ['a','c','b']",
            "assert dedupe_keep_last([]) == []",
            "assert dedupe_keep_last(['x','x','x']) == ['x']",
        ],
        "_solution": ("def dedupe_keep_last(xs):\n    seen = set()\n    out = []\n"
                      "    for x in reversed(xs):\n        if x not in seen:\n"
                      "            seen.add(x)\n            out.append(x)\n    return list(reversed(out))"),
    }


TEMPLATES = [t_chunked_sum, t_dedupe_keep_last]  # extend to ~20 templates for the real corpus


def validate(task: dict) -> bool:
    ns: dict = {}
    exec(task["_solution"], ns)
    for t in task["tests"]:
        exec(t, ns)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--out", default="../tasks/private/")
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for i in range(args.n):
        task = rng.choice(TEMPLATES)(rng, i)
        validate(task)
        task.pop("_solution")
        (out / f"{task['id']}.json").write_text(json.dumps(task, indent=2, ensure_ascii=False))
    print(f"generated {args.n} draft tasks in {out} -- HUMAN REVIEW REQUIRED before freeze")


if __name__ == "__main__":
    main()
