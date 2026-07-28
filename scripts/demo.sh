#!/usr/bin/env bash
# One-command demo: execute any eligible probe units against the pinned
# providers, then print the consensus leaderboard. Wired as `pnpm demo`.
# On an already-complete data dir the run step reports 0 executed and the
# leaderboard prints immediately; point --data at a fresh dir for a live
# collection pass (see README "Reproduce the smoke results").
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi

SANDBOX_MODE="${SANDBOX_MODE:-local}" npx tsx packages/runner/src/cli.ts run \
  --root ./smoke --data ./data
bash scripts/rank.sh
