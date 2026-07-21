#!/usr/bin/env bash
# Nightly evidence backup. The bundle is self-verifying: anyone restoring it
# can recompute the Merkle roots and check them against the on-chain anchors,
# so backup integrity is provable, not assumed.
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP=$(date -u +%F)
OUT="backups/invigil-data-${STAMP}.tar.gz"
mkdir -p backups
tar -czf "$OUT" data/
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
# push offsite if rclone is configured (any object storage):
if command -v rclone >/dev/null && [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$OUT" "$BACKUP_REMOTE" && echo "pushed to $BACKUP_REMOTE"
fi
