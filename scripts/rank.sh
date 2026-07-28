#!/usr/bin/env bash
# Print the cross-provider consensus leaderboard to the console.
# Wired as `pnpm rank`. Read-only over the evidence dirs; run `pnpm report`
# first if you want roots refreshed.
set -euo pipefail
cd "$(dirname "$0")/.."

PY=analysis/.venv/bin/python
if [ ! -x "$PY" ]; then
  echo "analysis venv missing; creating it..."
  python3 -m venv analysis/.venv
  "$PY" -m pip -q install -e "analysis[dev]"
fi

$PY analysis/scripts/rank.py \
  --clean data --replicate data-rep2 --providers smoke/configs/providers "$@"
