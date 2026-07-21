#!/usr/bin/env python3
"""Stage B calibration (METHODOLOGY section 5.2): from a large candidate pool,
select the greedy-divergence corpus by over-weighting prompts where fp8/int4
references diverge EARLY from BF16 -- precision-sensitive decision boundaries.

  python prompt_selection.py --candidates candidates.jsonl \
      --bf16 ref-bf16-a --quant ref-fp8 --out ../prompts/greedy.jsonl --n 300

Reads evidence JSONL produced by run_reference.py for each run id, computes
first-divergence char index per prompt, keeps the N earliest-diverging.
"""
import argparse, json, pathlib, sys

REPO = pathlib.Path(__file__).parent.parent


def first_divergence(a: str, b: str) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n if len(a) != len(b) else 10**9  # identical -> effectively infinite


def texts_for(run_id: str) -> dict:
    out = {}
    for f in sorted((REPO / "data" / "evidence").glob("*.jsonl")):
        for line in f.read_text().splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if r.get("provider") == run_id and r.get("probe") == "greedy":
                out[r["prompt_id"]] = r.get("text", "")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--bf16", required=True)
    ap.add_argument("--quant", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=300)
    args = ap.parse_args()

    bf16, quant = texts_for(args.bf16), texts_for(args.quant)
    scored = []
    for line in pathlib.Path(args.candidates).read_text().splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        pid = item["id"]
        if pid in bf16 and pid in quant:
            scored.append((first_divergence(bf16[pid], quant[pid]), item))
    scored.sort(key=lambda x: x[0])
    chosen = [item for _, item in scored[: args.n]]
    with open(args.out, "w", encoding="utf-8") as f:
        for item in chosen:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"selected {len(chosen)}/{len(scored)} prompts -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
