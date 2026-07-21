# Deployment topology

Nothing here is live yet. This document fixes WHERE each component will run,
so nothing gets built laptop-shaped by accident. Three horizons:

## Horizon 1 — Study ops (Stages A–E, now)

| Component | Home | How | Cost |
|---|---|---|---|
| Campaign runner + merkleize + anchor | **Study-ops box**: one small VM (Hetzner CX22 / Fly.io machine) or your laptop via cron | systemd timers (`deploy/systemd/`) or `deploy/docker-compose.yml` | ~£4/mo or £0 |
| Sandbox | Same box, Docker | `docker build -t invigil-sandbox packages/sandbox` | — |
| Reference lab | **Rented GPU, batch**: RunPod/Lambda 1× H100 80GB; rent → run → scp artifacts → terminate | `reference-lab/deploy_vllm.sh` | ~£150–300 total |
| Anchors | **Base Sepolia** (rehearsal) → **Base mainnet** (from freeze onward) | `packages/anchor` scripts | pennies/tx |
| Leaderboard + report | **GitHub Pages** (static, free, no server to defend) | `.github/workflows/pages.yml` (manual dispatch) | £0 |
| Evidence bundles (public) | GitHub release assets alongside the report | publication checklist | £0 |
| Verifier CLI | **Everyone else's machine** — that is the point | npm publish at Stage E | £0 |
| Secrets | `.env` on the ops box + GitHub Actions secrets; never in repo (CI greps history) | — | — |

Why a VM and not serverless: the campaign is stateful (checkpoint, append-only
evidence log, 6-hour gap scheduling) and must survive weeks of interrupted
runs. A £4 VM with a persistent disk is the correct tool; a queue+lambda
topology adds failure modes to save pennies.

**Environment separation.** `ANCHOR_RPC_URL` + contract address distinguish
rehearsal (Base Sepolia) from production (Base mainnet). Rehearse the ENTIRE
pipeline against Sepolia before freeze; the mainnet contract is deployed once,
at freeze, and its address goes in the report.

**Runner-in-Docker note.** The runner shells out to `docker` for the sandbox.
Recommended: runner on the host (systemd), sandbox in Docker. The compose file
instead mounts `/var/run/docker.sock` into the runner container — convenient,
but socket access is root-equivalent on that box; acceptable for a
single-purpose study VM, unacceptable later for multi-tenant SaaS. Both paths
ship.

## Horizon 2 — Continuous leaderboard (Stage F passed, pre-revenue)

Same VM, plus: a per-cycle job regenerates private tasks (single-use policy),
re-runs the campaign, republishes Pages. Add a dead-man switch
(healthchecks.io free tier, pinged from the systemd service on success).
Backups: `deploy/backup.sh` nightly → any object storage. Backups are
**verifiable**: anyone restoring one can recompute the Merkle roots and check
them against the on-chain anchors — backup integrity is provable, not assumed.

## Horizon 3 — Monitor tier (first paying customers) — seams pre-cut, not built

| Component | Home | Notes |
|---|---|---|
| API + auth + alerting | NestJS on Fly.io/Railway (2 regions) | the deferred-NestJS decision lands here |
| DB | Managed Postgres (Neon/Supabase/RDS) | customer configs + alert state; evidence stays append-only JSONL per study cycle, object-stored |
| Queue/scheduler | BullMQ + Redis (managed) | replaces cron when per-customer schedules multiply |
| Probe workers | the same runner package, containerized — `deploy/Dockerfile.runner` IS the worker image | horizontal scale = more workers, same code |
| Dashboards | Next.js on Vercel/Pages | reads the API |
| Status/incident page | hosted status product | a trust company runs visible ops |

The load-bearing property: `packages/runner` and `packages/core` are already
daemon-agnostic (pure functions + a CLI). Horizon 3 wraps them in services; it
does not rewrite them.

## Bootstrap recipe for the study-ops VM (Horizon 1, systemd path)

```bash
# as root on a fresh Ubuntu 24 box
adduser --system --group invigil && usermod -aG docker invigil
apt-get update && apt-get install -y docker.io nodejs npm git && corepack enable
git clone <repo> /opt/invigil-study && cd /opt/invigil-study
pnpm install --frozen-lockfile && pnpm -r build
docker build -t invigil-sandbox packages/sandbox
cp .env.example .env && $EDITOR .env          # keys, signing key, anchor config
cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now invigil-run.timer invigil-daily.timer
```
