# 3-minute demo script

Talk track for a live or recorded demo of this repo. Framing: this repo is the
study, and the study is Invigil's first step. Narration is ~420 words, a
comfortable pace for 3 minutes with command runtime absorbed into the pauses.

## Before you record

- `corepack enable && pnpm install && pnpm -r build` (one-time).
- `.env` present with `OPENROUTER_KEY` and `INVIGIL_SIGNING_KEY` (demo.sh sources it).
- Use the completed `./data` dir: `pnpm demo` then reports 0 executed and goes
  straight to the leaderboard, which is what you want in a 3-minute window. For a
  live collection pass instead, point at a fresh `--data` dir and budget 30+ minutes.
- Have `docs/results/ranking.md` and `docs/charts/smoke-divergence.png` ready in
  a second pane or editor tab.

---

## 0:00 - 0:25 · The problem (terminal at repo root, nothing running)

> Open-weight models like DeepSeek and Qwen are served by dozens of competing
> providers, and nothing stops a provider from quietly serving a cheaper,
> degraded version of the model it advertises. Nobody independently checks.
> This repo is that check. It is the study, and it is Invigil's first step:
> probe providers serving the same open model, compare them, and record every
> request as tamper-evident cryptographic evidence.

## 0:25 - 0:55 · Run the instrument

Run:

```bash
pnpm demo
```

While it runs:

> One command runs the instrument. It executes probe units against five pinned
> providers: real coding tasks with the model's code executed in a locked-down
> sandbox, greedy-decoding divergence, logprob fingerprinting, and long-context
> needle retrieval. Every request and response becomes a leaf in a Merkle tree,
> with Ed25519-signed receipts. On a completed data directory it confirms
> nothing is left to run and prints the consensus leaderboard.

## 0:55 - 1:40 · The findings (leaderboard now on screen)

Point at the ranking table (also in `docs/results/ranking.md`):

> This is live data from July 2026: five providers serving the same DeepSeek
> model, three committed runs, nearly nine hundred evidence records. Three
> findings. First, provider defaults silently change results: two providers
> retrieved a long-context needle zero times out of four under their own
> defaults, then four out of four once every parameter was explicit. Same model
> ID, same request. Second, temperature-zero is not reproducible across
> providers: alignment with the cross-provider consensus ranges from one
> hundred percent at the top down to fifty-eight at the bottom, against a
> measured sixty-five percent self-consistency noise floor. Third, transparency
> itself varies: only two of five providers expose logprobs at all.

## 1:40 - 2:20 · Why you can trust it

Run:

```bash
npx tsx packages/verifier-cli/src/cli.ts ./data
```

> Here is what makes this a study rather than a blog post. The evidence log is
> append-only canonical JSON. This verifier is independent: it recomputes the
> Merkle roots from the raw bytes and checks every signature, so anyone can
> confirm the data was never altered after the fact. At publication the roots
> are anchored on-chain in a write-once contract, so not even we can rewrite a
> finding. The end-to-end test plants a deliberately degraded provider and the
> pipeline convicts it, then rejects a tampered bundle.

## 2:20 - 3:00 · First step (README or NARRATIVE.md on screen)

> Everything you just saw is the smoke study: proof the instrument works end to
> end on real providers. Next is the pre-registered Study 001: six to ten
> providers, a self-hosted full-precision reference with a measured noise
> floor, three hundred tasks at five samples each, provider notice with right
> of reply, and results anyone can recompute from the anchored evidence. That
> study is the launch of Invigil, the independent rating agency for AI compute.
> The Integrity Index is the first brick. This repo is the first step.

---

## Fallbacks

- If `pnpm demo` stalls on network, cut to `pnpm rank` (reads committed data,
  no API calls) and keep the same narration.
- If asked "who is wrong?" on the consensus spread: no claim until the
  self-hosted BF16 reference exists; the spread itself is the finding
  (approved-claims language in `docs/SMOKE-RESULTS.md`).
- If asked about cost: a full 295-unit replicate run is a few cents and 30 to
  60 minutes from any laptop with an OpenRouter key.
