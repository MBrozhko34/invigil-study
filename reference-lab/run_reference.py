#!/usr/bin/env python3
"""Run the full probe corpus against the local vLLM reference endpoint,
emitting evidence records in the shared canonical format.

  python run_reference.py --run-id ref-bf16-a [--base-url http://127.0.0.1:8000/v1]

Two runs with distinct --run-id on separate days/instances form the noise floor.
"""
import argparse, datetime, hashlib, json, pathlib, sys, time, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from canonical import canonicalize  # noqa: E402

REPO = pathlib.Path(__file__).parent.parent


def keccak_placeholder_sha(text: str) -> str:
    # Prompt identity hash for reference records. sha256 is fine here: prompt
    # identity is matched by prompt_id in analysis; Merkle leaves (which must be
    # keccak) are computed by the TS toolchain over the whole line.
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()


def chat(base_url: str, model: str, prompt: str, max_tokens: int, want_logprobs: bool = False) -> dict:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0, "top_p": 1, "frequency_penalty": 0, "presence_penalty": 0,
        "max_tokens": max_tokens, "stream": False, "n": 1,
    }
    if want_logprobs:
        body["logprobs"] = True
        body["top_logprobs"] = 5
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        j = json.load(r)
    j["_latency_ms"] = int((time.time() - t0) * 1000)
    return j


def to_logprob_strings(choice: dict) -> list:
    out = []
    for c in (choice.get("logprobs") or {}).get("content") or []:
        out.append({
            "token": str(c.get("token", "")),
            "logprob": format(float(c.get("logprob", float("nan"))), ".9g"),
            "top": [
                {"token": str(t.get("token", "")), "logprob": format(float(t.get("logprob", float("nan"))), ".9g")}
                for t in (c.get("top_logprobs") or [])
            ],
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True, help="e.g. ref-bf16-a / ref-bf16-b / ref-fp8 / ref-int4")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="Qwen/Qwen2.5-Coder-32B-Instruct")
    args = ap.parse_args()

    out_dir = REPO / "data" / "evidence"
    out_dir.mkdir(parents=True, exist_ok=True)

    def emit(record: dict) -> None:
        date = record["ts"][:10]
        with open(out_dir / f"{date}.jsonl", "a", encoding="utf-8") as f:
            f.write(canonicalize(record) + "\n")

    def now() -> str:
        return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
               f"{datetime.datetime.now(datetime.timezone.utc).microsecond // 1000:03d}Z"

    base = {
        "v": 1, "kind": "generation", "study": "invigil-study-001",
        "provider": args.run_id, "endpoint": args.base_url,
        "model_claimed": args.model,
    }

    # greedy corpus
    for line in (REPO / "prompts" / "greedy.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        j = chat(args.base_url, args.model, item["prompt"], 256)
        ch = j["choices"][0]
        emit({**base, "ts": now(), "probe": "greedy", "unit_key": f"greedy/{args.run_id}/{item['id']}",
              "prompt_id": item["id"], "prompt_sha": keccak_placeholder_sha(item["prompt"]),
              "model_reported": j.get("model"), "response_status": "ok",
              "http_status": 200, "finish_reason": ch.get("finish_reason"),
              "latency_ms": j["_latency_ms"], "attempts": 1, "error": None,
              "usage_prompt_tokens": (j.get("usage") or {}).get("prompt_tokens"),
              "usage_completion_tokens": (j.get("usage") or {}).get("completion_tokens"),
              "text": ch["message"]["content"]})

    # logprob corpus
    for line in (REPO / "prompts" / "logprob.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        j = chat(args.base_url, args.model, item["prompt"], 1, want_logprobs=True)
        ch = j["choices"][0]
        emit({**base, "ts": now(), "probe": "logprob", "unit_key": f"logprob/{args.run_id}/{item['id']}",
              "prompt_id": item["id"], "prompt_sha": keccak_placeholder_sha(item["prompt"]),
              "model_reported": j.get("model"), "response_status": "ok",
              "http_status": 200, "finish_reason": ch.get("finish_reason"),
              "latency_ms": j["_latency_ms"], "attempts": 1, "error": None,
              "usage_prompt_tokens": (j.get("usage") or {}).get("prompt_tokens"),
              "usage_completion_tokens": (j.get("usage") or {}).get("completion_tokens"),
              "text": ch["message"]["content"], "logprobs": to_logprob_strings(ch)})

    # bench corpus: generations only -- execution happens on the laptop via the
    # TS sandbox so provider and reference code run under IDENTICAL conditions.
    for task_file in sorted((REPO / "tasks" / "public").glob("*.json")) + sorted((REPO / "tasks" / "private").glob("*.json")):
        task = json.loads(task_file.read_text())
        instruction = ("Complete the following Python function. Reply with a single Python code block "
                       "containing the complete function definition and nothing else.\n\n")
        prompt = instruction + task["prompt"]
        for rep in range(3):
            j = chat(args.base_url, args.model, prompt, 768)
            ch = j["choices"][0]
            emit({**base, "ts": now(), "probe": "bench", "unit_key": f"bench/{args.run_id}/{task['id']}/r{rep}",
                  "task_id": task["id"], "rep": rep, "prompt_sha": keccak_placeholder_sha(prompt),
                  "model_reported": j.get("model"), "response_status": "ok",
                  "http_status": 200, "finish_reason": ch.get("finish_reason"),
                  "latency_ms": j["_latency_ms"], "attempts": 1, "error": None,
                  "usage_prompt_tokens": (j.get("usage") or {}).get("prompt_tokens"),
                  "usage_completion_tokens": (j.get("usage") or {}).get("completion_tokens"),
                  "text": ch["message"]["content"]})

    print(f"reference run {args.run_id} complete -> {out_dir}")


if __name__ == "__main__":
    main()
