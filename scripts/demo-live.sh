#!/usr/bin/env bash
# Live re-probe for demos, wired as `pnpm demo:live`. Every invocation:
#   1. creates a FRESH data dir (real API traffic, no checkpoint resume)
#   2. executes the greedy probe family against all pinned providers
#   3. merkle-roots the new evidence
#   4. prints the consensus report to the console (full table in the run dir)
# Demo-scale corpus (10 prompts x 5 providers, ~2 min); results WILL vary
# between invocations -- that is the measured temp-0 noise floor, live.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi

PY=analysis/.venv/bin/python
if [ ! -x "$PY" ]; then
  echo "analysis venv missing; creating it..."
  python3 -m venv analysis/.venv
  "$PY" -m pip -q install -e "analysis[dev]"
fi

STAMP=$(date -u +%Y%m%d-%H%M%S)
DATA="./data-live/$STAMP"
echo "live probe pass -> $DATA (greedy family, real API traffic, fresh evidence log)"

npx tsx packages/runner/src/cli.ts plan --root ./smoke-live --data "$DATA" > /dev/null
npx tsx packages/runner/src/cli.ts run  --root ./smoke-live --data "$DATA" --family greedy
npx tsx packages/runner/src/cli.ts merkleize --root ./smoke-live --data "$DATA" > /dev/null

$PY analysis/scripts/rank.py \
  --clean "$DATA" --providers smoke-live/configs/providers \
  --out "$DATA/ranking.md"
