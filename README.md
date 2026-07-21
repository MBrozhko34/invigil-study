# Invigil Study 001

Software for executing **Invigil Study 001**: a pre-registered, cryptographically
evidenced study of whether inference providers faithfully serve the open-weight
coding model they advertise. The methodology is the contract: see
[`METHODOLOGY.md`](./METHODOLOGY.md). This repo is the instrument that executes it.

**One sentence:** probe 6–10 providers serving the same open model, compare against
a self-hosted full-precision reference, apply pre-declared statistics, and publish
tamper-evident results anyone can independently verify.

**Latest results:** numbers auto-generated at [`docs/results/latest.md`](./docs/results/latest.md)
(regenerate any time with `pnpm report`); discussion, limitations, and approved claims at
[`docs/SMOKE-RESULTS.md`](./docs/SMOKE-RESULTS.md). July 2026 smoke study, five pinned
providers, three committed runs: provider defaults silently flipping long-context results,
a measured ~65% temperature-0 self-consistency noise floor, and a cross-provider consensus
ranking that replicates across independent runs.
Company story: [`docs/NARRATIVE.md`](./docs/NARRATIVE.md).

---

## Repository map

| Path | What it is | Language |
|---|---|---|
| `packages/core` | Canonical JSON, keccak256, sorted-pair Merkle, Ed25519 receipts: the shared spine | TypeScript |
| `packages/providers` | One OpenAI-compatible adapter; per-provider quirks live in YAML, never code | TypeScript |
| `packages/runner` | Campaign engine: plan → run (resumable, cron-friendly) → merkleize; the four probe families | TypeScript |
| `packages/sandbox` | Docker-isolated execution of model-generated code (+ local CI fallback, mode stamped in evidence) | TS + Python |
| `packages/verifier-cli` | Independent bundle verifier: recompute roots, check receipts, check on-chain anchors. **Public trust artifact** | TypeScript |
| `packages/anchor` | `StudyAnchor.sol` write-once commitment registry + Hardhat deploy/anchor scripts | Solidity |
| `packages/e2e` | Full-pipeline dry run with planted degradation and tamper-rejection | TypeScript |
| `analysis/` | Pre-declared statistics: bootstrap RQ1, Mann-Whitney RQ2, Holm, power gate, mechanical verdicts | Python |
| `reference-lab/` | vLLM reference deployment + runs, quantized secondary refs, prompt selection, private-task generator | Python/bash |
| `site/` | Static leaderboard generator (no framework; GitHub-Pages ready) | TypeScript |
| `configs/` | `study.yaml`, `probes.yaml`, one YAML per provider | - |
| `tasks/`, `prompts/` | Probe corpora (public samples in-repo; private corpus gitignored, root anchored at freeze) | - |

## Operations matrix: who runs what, where

Authoritative deployment detail (three horizons, VM bootstrap recipe, compose vs systemd): [`deploy/DEPLOYMENT.md`](./deploy/DEPLOYMENT.md).

| Component | Runs on | When | Cost |
|---|---|---|---|
| Campaign runner, probes, merkleize | **Your laptop** (cron invokes `invigil run` each window) | Stage C, daily | API spend only |
| Sandbox (Docker) | Your laptop (`docker build -t invigil-sandbox packages/sandbox`) | During bench probes | - |
| Reference lab (vLLM, BF16 + fp8/int4) | **Rented GPU box**: 1× H100 80GB (RunPod/Lambda), batch sessions, terminate after | Stage B, ~2–3 sessions | ~£150–300 total |
| Analysis + site generation | Your laptop | Stage D | - |
| Anchoring (`deploy` once, `anchor` per batch) | Your laptop → **Base L2** (Sepolia for rehearsal) | Freeze + daily batches | Pennies per tx |
| CI (unit + E2E, local sandbox mode) | GitHub Actions | Every push | Free |
| Leaderboard | GitHub Pages (static `site/out/`) | Stage E onward | Free |
| Verifier CLI | **Anyone, anywhere**: that is the point | Post-publication | - |

## Model selection (finalize at Stage B freeze)

Primary candidate: **`Qwen/Qwen2.5-Coder-32B-Instruct`**: dense (METHODOLOGY
criterion 6: MoE routing inflates the noise floor), coder-specialist (the buyer
segment), historically the most multi-homed open coder model, and BF16 fits a
single H100 80GB with headroom. **Verify multi-homing on OpenRouter at freeze**:
the provider landscape shifts monthly; the config pins `hfRevision` to an
exact weight commit, never a name. Fallback rule and alternatives are
pre-declared in METHODOLOGY §2.

## Quickstart

```bash
corepack enable && pnpm install
pnpm -r build

# all TS tests + full-pipeline E2E (uses local sandbox mode)
SANDBOX_MODE=local pnpm test

# Python analysis tests
cd analysis && pip install -e ".[dev]" && pytest -q
```

Generate a signing key and configure secrets:

```bash
pnpm --filter @invigil/core keygen   # -> INVIGIL_SIGNING_KEY
cp .env.example .env                  # fill provider keys, anchor RPC/key
```

## Reproduce the smoke results (no GPU required)

Anyone with an OpenRouter key can re-run the smoke study end to end from a laptop.
Total cost is a few cents per run; a full 295-unit pass takes 30 to 60 minutes.

```bash
# 1. Setup (Node 22 + pnpm + Python 3.12+)
corepack enable && pnpm install && pnpm -r build
python3 -m venv analysis/.venv && analysis/.venv/bin/pip install -e "analysis[dev]" matplotlib
cp .env.example .env                  # set OPENROUTER_KEY; INVIGIL_SIGNING_KEY from: pnpm --filter @invigil/core keygen

# 2. Plan and run (repeat `run` until it reports 0 executed: bench rep-1 units
#    become eligible only after their rep-0 completes, by design for cron use)
set -a; source .env; set +a
npx tsx packages/runner/src/cli.ts plan --root ./smoke --data ./data
SANDBOX_MODE=local npx tsx packages/runner/src/cli.ts run --root ./smoke --data ./data
npx tsx packages/runner/src/cli.ts status --root ./smoke --data ./data

# 3. Regenerate every results artifact (merkle roots, consensus, self-consistency,
#    chart, and docs/results/latest.md)
pnpm report

# 4. Independently verify the evidence was never altered
npx tsx packages/verifier-cli/src/cli.ts ./data
```

Replicate runs (`--data ./data-rep2`) enable the run-to-run self-agreement table.
Provider pins live in `smoke/configs/providers/*.yaml`; the OpenRouter slugs in each
`order:` field must match the endpoints API exactly. Note the evidence logs are
append-only: rerunning against an existing data dir resumes from its checkpoint
rather than starting fresh.

### Where the blockchain fits

The chain is the evidence layer's external timestamp, not a gimmick: every probe
request/response is a leaf in a per-day sorted-pair keccak256 Merkle tree, and
`packages/anchor` (`StudyAnchor.sol`, write-once, Base) anchors each day's root
on-chain at publication. After anchoring, nobody, including us, can rewrite or
retro-edit findings: the verifier CLI recomputes roots from the raw JSONL logs and
checks them against the anchored values via `eth_call`, so a tampered bundle fails
against a timestamp we do not control. Smoke-scale roots are file-committed only
(`data*/roots.json`); on-chain anchoring activates for Study 001 publication.
Zero-knowledge proofs (the dissertation layer) are reserved for escalation and are
deliberately not part of routine probing.

## Runbook by methodology stage

**Stage A: setup**
1. Copy `configs/providers/_template.yaml` per provider (ToS review first: METHODOLOGY §3).
2. `docker build -t invigil-sandbox packages/sandbox`
3. Import the public benchmark subset into `tasks/public/` (record attribution);
   draft private tasks: `python reference-lab/generator.py --n 120 --seed <seed>` → human review.
4. Deploy `StudyAnchor` to Base Sepolia for rehearsal: `pnpm --filter @invigil/anchor deploy:baseSepolia`.

**Stage B: calibration (before freeze)**
1. Rent GPU → `REVISION=<hf-commit> bash reference-lab/deploy_vllm.sh`
2. `python reference-lab/run_reference.py --run-id ref-bf16-a` (repeat next day on the
   **same GPU type** as `ref-bf16-b` → noise floor); fp8/int4 via `quantized_refs.py`.
3. Select the greedy corpus: `python reference-lab/prompt_selection.py ...`
4. **Power gate:** run `invigil_analysis.power.simulate_power` on calibration pass
   rates: see *Power finding* below. Adjust task count/k, update METHODOLOGY to v0.3.
5. Freeze: hash METHODOLOGY.md → `METHODOLOGY.frozen.hash`; Merkle-root the private
   tasks → `data/private-tasks.root`; anchor both (`pnpm --filter @invigil/anchor anchor`).

**Stage C: collection**
```bash
npx tsx packages/runner/src/cli.ts plan            # manifest with config hashes
npx tsx packages/runner/src/cli.ts run             # cron this; executes eligible units, prints next wake
npx tsx packages/runner/src/cli.ts status
npx tsx packages/runner/src/cli.ts merkleize       # end of each day
pnpm --filter @invigil/anchor anchor              # batch daily roots on-chain
```

**Stage D: analysis**
```python
from invigil_analysis.report_export import run_analysis
run_analysis("data", "configs/probes.yaml", reference="ref-bf16-a",
             noise_pair=("ref-bf16-a", "ref-bf16-b"),
             advertised={...}, out_path="analysis/out/verdicts.json")
```
```bash
npx tsx site/generate.ts   # -> site/out/index.html
```

**Stage E: notice & publish**: work through the publication gates (tracked outside this repository).

**Anyone: verify**
```bash
npx tsx packages/verifier-cli/src/cli.ts data/ \
  --rpc https://mainnet.base.org --contract 0x<StudyAnchor>
```

## Power finding (build, 2026-07-14): action required before freeze

The pre-declared power gate (METHODOLOGY §6.5), implemented in
`analysis/src/invigil_analysis/power.py`, shows the v0.2 scale is
**underpowered**: at 180 tasks × k=3, power against even a true **6pp** gap is
~0.57 (and ~0.20 at 3pp): binomial variance of pass@1 dominates. The frontier:

| Tasks × k | Power vs true 6pp (threshold 3pp) |
|---|---|
| 180 × 3 (v0.2) | 0.57 ✗ |
| 300 × 3 | 0.77 ✗ |
| **300 × 5** | **0.93 ✓** |
| 400 × 5 | 0.98 ✓ |

Recommended resolution at Stage B: **300 tasks × k=5** (budget impact ≈ 1,500
bench requests/provider, still well inside the £800 cap), recorded as a
labelled v0.3 amendment. This is the pre-registration process working as
designed: the gate refused an under-instrumented study before any data existed.

## Deviations from the Phase 1 plan (logged per protocol)

1. **SQLite dropped.** JSONL is the source of truth; pandas reads it natively and
   the verifier needs raw lines anyway. Removes native builds from the public repo.
2. **Docker via shell-out, not dockerode.** One fewer dependency; the exact
   isolation flags are auditable in `packages/sandbox/src/runner.ts`.
3. **Local sandbox fallback added** for CI/dev. Never for study data: the mode is
   stamped into every execution record, so misuse is detectable in the evidence itself.
4. **statsmodels dropped**: scipy covers every pre-declared test.
5. **NestJS deferred** to the paid Monitor tier; the study runner is plain TS with
   constructor DI (approved as T2).

## Security posture

Untrusted model output executes only inside `--network none --cpus 1 --memory 512m
--pids-limit 128 --read-only` containers as `nobody`. Keys live in env/secrets, never
in the repo (CI greps history before the repo goes public). The evidence log rejects
floats and non-canonical bytes at write time; the verifier re-checks everything from
raw bytes on the other side. The anchoring wallet holds pennies and can only call
`anchor`, and the contract forbids overwriting, including by us. **The design goal
is that we could not forge our own records if we wanted to.**

## License

MIT. The methodology document is CC-BY-4.0 once frozen.
