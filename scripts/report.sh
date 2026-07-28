#!/usr/bin/env bash
# Regenerate every results artifact from the evidence logs. Idempotent; run
# any time after a campaign pass. Wired as `pnpm report`.
set -euo pipefail
cd "$(dirname "$0")/.."

PY=analysis/.venv/bin/python
if [ ! -x "$PY" ]; then
  echo "analysis venv missing; creating it..."
  python3 -m venv analysis/.venv
  "$PY" -m pip -q install -e "analysis[dev]" matplotlib
fi

for d in data data-rep2; do
  [ -d "$d/evidence" ] && npx tsx packages/runner/src/cli.ts merkleize --root ./smoke --data "./$d" > /dev/null
done

$PY analysis/scripts/consensus_report.py \
  --data data --providers smoke/configs/providers --out data/analysis/consensus.json
if [ -d data-rep2/evidence ]; then
  $PY analysis/scripts/self_consistency.py \
    --run-a data --run-b data-rep2 --out data/analysis/self-consistency.json
fi
if [ -d data-run1-provider-defaults/evidence ]; then
  $PY analysis/scripts/smoke_chart.py \
    --run1 data-run1-provider-defaults --run2 data \
    --consensus data/analysis/consensus.json --out docs/charts/smoke-divergence.png
fi
$PY analysis/scripts/generate_report.py \
  --clean data --replicate data-rep2 --defaults data-run1-provider-defaults \
  --providers smoke/configs/providers --out docs/results/latest.md
$PY analysis/scripts/rank.py \
  --clean data --replicate data-rep2 --providers smoke/configs/providers \
  --out docs/results/ranking.md > /dev/null

echo "regenerated: docs/results/latest.md, docs/results/ranking.md, docs/charts/smoke-divergence.png"
