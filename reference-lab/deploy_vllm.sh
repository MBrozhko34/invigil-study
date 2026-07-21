#!/usr/bin/env bash
# Pin and serve the reference model. Record EVERYTHING (METHODOLOGY section 4).
set -euo pipefail

MODEL="${MODEL:-Qwen/Qwen2.5-Coder-32B-Instruct}"
REVISION="${REVISION:?set REVISION to the pinned HF commit hash (never a branch name)}"
PORT="${PORT:-8000}"

pip install "vllm==0.9.1" "huggingface_hub" --quiet

mkdir -p artifacts
{
  echo "model: $MODEL"
  echo "revision: $REVISION"
  echo "vllm: $(pip show vllm | grep ^Version)"
  echo "cuda: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)"
  echo "gpu: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)"
  echo "date: $(date -u +%FT%TZ)"
} | tee artifacts/environment-manifest.txt

# Greedy-friendly serving: single sequence per batch would be ideal for
# determinism but is cost-prohibitive; we measure the residual nondeterminism
# instead (noise floor) rather than pretending it away.
exec python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" --revision "$REVISION" \
  --dtype bfloat16 --max-model-len 32768 --port "$PORT" \
  --disable-log-requests
