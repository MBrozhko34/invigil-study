# Invigil Study 001 — Pre-Registered Methodology

**Title:** Are inference providers faithfully serving open-weight coding models? A cross-provider fidelity study.

**Status:** DRAFT v0.1 — to be frozen and hash-committed before any data collection begins.
**Author:** Michael Brozhko
**Date frozen:** _____________ (fill on freeze)
**Methodology commitment:** keccak256 hash of this frozen document, anchored on-chain at: _____________ (tx hash, fill on freeze)

---

## 0. Pre-registration statement

This document specifies the complete study design — model selection, provider set, probe battery, sample sizes, statistical tests, decision thresholds, and publication rules — **before** any measurement data is collected. The frozen document's hash is committed on-chain prior to data collection. Any deviation during execution will be disclosed in the published report as a labelled amendment. Pilot/calibration runs (Section 8, Stage B) are permitted before freezing; their data will not be included in reported results.

Purpose of pre-registration: (a) scientific credibility — findings cannot be accused of threshold-shopping or cherry-picking; (b) legal defensibility — published verdicts follow mechanically from pre-declared rules; (c) brand — the study *demonstrates* the commitment-based verification methodology that Invigil sells.

---

## 1. Research questions

- **RQ1 (primary):** Do providers serving the same open-weight coding model deliver measurably different functional quality (benchmark pass rates) than a full-precision reference?
- **RQ2:** Do providers' output distributions diverge from the full-precision reference in ways consistent with weight quantization or configuration modification (greedy divergence, logprob divergence)?
- **RQ3:** Are advertised configurations (context length, sampling-parameter support) honored in practice?
- **RQ4 (descriptive):** How do price, latency, and fidelity trade off across the provider landscape for this model?

Out of scope for Study 001: model substitution detection, hidden system-prompt detection, closed/proprietary models, training verification, per-request cryptographic proofs. These are explicitly future work.

---

## 2. Model selection

**One model only.** Selection criteria (all must hold):

1. Open weights, permissive-enough license to self-host for reference inference.
2. Served by **≥ 6 independent providers** (verify current multi-homing on OpenRouter's model page and provider docs at freeze time).
3. Widely used for coding / agentic coding workloads (the buyer segment).
4. Small enough that a BF16 reference deployment fits on 1–2 rented GPUs (target ≤ ~35B parameters dense, or an MoE with comparable active footprint).
5. Providers serve it at *mixed advertised precisions* (some fp8/int4 endpoints listed) — this guarantees the study has variance to measure.
6. **Prefer a dense architecture over MoE** where the choice exists: MoE expert routing under batching inflates honest nondeterminism, widening the noise floor and weakening every statistical test. If only an MoE candidate meets criterion 2, the noise-floor sample sizes in Section 4 are doubled.

**Candidate shortlist (verify at freeze):** Qwen coder-class mid-size model; DeepSeek coder-class model; any Llama-derivative coder that meets criterion 2. Final choice recorded here at freeze: **MODEL = _____________**, HuggingFace revision pin: **_____________** (commit hash — the reference is a specific weight artifact, not a name).

**Fallback rule (pre-declared):** if criterion 2 fails for all coder-specialist models, substitute the most multi-homed general model that is commonly used for coding, and say so in the report.

---

## 3. Provider set and access

**Inclusion:** every provider serving MODEL through an OpenAI-compatible API that (a) is listed on OpenRouter or has a public direct API, and (b) allows self-serve signup. Target N = 6–10 providers.

**Access rules:**
- Direct provider APIs preferred; OpenRouter used only with the endpoint **pinned to a single named provider variant** (full slug), never auto-routed.
- **Two accounts per provider** where terms permit: one "study" account, one "clean" account created later from different billing/IP, used to re-verify any provider that fails thresholds (guards against per-account behavior).
- Record at capture time, for every request: provider, endpoint slug, advertised precision/quantization label (as published by the provider or OpenRouter at study time — screenshot/archive), price per Mtok, region if disclosed, timestamp.
- Requests spread across ≥ 3 time-of-day windows and ≥ 5 calendar days per provider to average over load conditions.

**Request protocol (normalized, pre-declared):**
- **Every sampling parameter is set explicitly on every request** — temperature=0, top_p=1, top_k disabled (or =1 where the API requires a value), frequency/presence penalties=0, seed fixed where supported, identical max_tokens and stop sequences within each probe family, non-streaming mode. Provider *defaults* differ silently; unset parameters are a confounder, not a convenience.
- **Retry policy:** transient failures (429/5xx/timeouts) retried up to 3 times with exponential backoff; all retries logged as such. A request failing all retries counts toward the 10% failure budget. Content refusals are recorded as final responses and never retried.
- **Provider caching:** identical repeated prompts may be served from provider caches, masking true generation behavior. The k=3 benchmark generations per task are therefore spaced ≥ 6 hours apart. No prompt-mutation cache-busting is used — mutating the prompt would change the measurement itself.
- **Mid-study backend changes:** the response `model`/version field is recorded on every request. If a provider visibly changes backend or model revision mid-collection, that provider's data is split at the change point and only the larger contiguous window is analyzed (disclosed in the report).

**Probe indistinguishability:** probe prompts are drawn from a freshly generated private corpus (Section 5.1) plus a public-benchmark subset; ordering randomized; no identifying headers; standard SDK user-agents. Rationale: a provider must not be able to special-case the study.

**Terms-of-service check:** before freeze, review each provider's ToS for benchmarking prohibitions. Providers whose ToS forbids benchmarking are excluded and listed as such in the report (exclusion is itself informative).

---

## 4. Reference baseline

**Primary reference:** self-hosted MODEL at the pinned revision, BF16 (or the highest precision the weights are published in), served via vLLM on rented GPUs (RunPod/Lambda equivalent). Version-pin and record: vLLM version, CUDA version, GPU type, tokenizer hash, chat template hash, all sampling defaults.

**Chat-template control (critical confounder):** the exact chat template applied by each provider may differ from the reference. Mitigation: (a) probe via the raw completions endpoint where offered; (b) where only chat endpoints exist, send single-turn messages with no system prompt and empirically compare tokenization behavior via short echo/continuation probes; (c) any provider whose divergence is plausibly attributable to template differences is flagged "template-confounded" rather than "degraded" — this label is a pre-declared verdict category.

**Reference self-consistency baseline (critical for honest statistics):** run the full greedy-divergence prompt set (Section 5.2) against the reference **twice, on separate days/instances**, and against a second independent full-precision source if one exists (the model creator's first-party API). The distribution of reference-vs-reference divergence defines the *noise floor*: honest serving is not perfectly deterministic (batching, kernel nondeterminism). All provider comparisons are measured **relative to this noise floor**, never against an assumption of exact match. **Both reference runs use the same GPU type and count** (numerics differ across GPU generations even at BF16); cross-GPU-type variance is measured once, separately, and reported — it also informs how much divergence to expect from providers running honest BF16 on different hardware.

**Secondary quantized references (small, deliberate):** the reference lab also produces **fp8 and int4-AWQ (or equivalent)** runs of MODEL on the *same* probe sets. These are not used for verdicts; they are used descriptively, to say "provider X's divergence profile most resembles the int4 reference" — evidence of *mechanism*, which strengthens the report substantially at modest cost (~2 extra GPU-days).

---

## 5. Probe battery

### 5.1 Functional coding benchmark (primary, drives RQ1)

- **Task set:** 180 tasks total = 60 drawn from an established public execution-based benchmark (for comparability) + 120 **freshly authored/generated private tasks** in the same format (function implementation with hidden unit tests), created after MODEL's release, never published before the report. Private tasks exist because public ones could in principle be special-cased; agreement between public and private subsets is itself a reported check. **The private task set's Merkle root is anchored on-chain at freeze** (tasks revealed 30 days post-publication), making task selection provably pre-registered — no accusation of post-hoc task cherry-picking can stand. Note the honest limit: providers necessarily *see* private tasks during collection, so they are **single-use** — every future leaderboard cycle regenerates the private set. This rolling regeneration is a standing operational policy, not just a study detail.
- **Protocol:** temperature 0, fixed max_tokens, identical prompt formatting across providers and reference, **k = 3 independent generations per task per provider** (captures nondeterminism), pass@1 estimated from the 3 runs.
- **Execution:** generated code is run against hidden tests in an isolated Docker sandbox (no network, CPU/time limits). Pass/fail is mechanical — this is what makes RQ1 findings indisputable.
- **Metric:** pass-rate per provider vs reference pass-rate on the same tasks; paired-by-task comparison.

### 5.2 Greedy-decoding divergence (RQ2)

- **Prompt set:** 300 prompts, temperature 0: 150 code-continuation prompts sampled from permissively licensed repositories (truncated mid-function), 150 short reasoning/instruction prompts. Selected during calibration (Stage B) to over-weight prompts where the fp8/int4 secondary references diverge early from BF16 — i.e., prompts near precision-sensitive decision boundaries.
- **Metric:** token index of first divergence from the reference completion, and total edit distance over the first 256 output tokens. Compared distribution-vs-distribution against the reference self-consistency noise floor.

### 5.3 Logprob divergence (RQ2, where available)

- For providers exposing top-k logprobs: 200 single-token-answer prompts; compare top-5 logprob vectors against the reference via total-variation distance and rank agreement. Providers not exposing logprobs are marked N/A for this probe (not penalized).

### 5.4 Context-window probe (RQ3)

- Needle-in-haystack retrieval at 25%, 50%, 75%, 95% of *advertised* context length, 20 trials per depth. Failure pattern at high depths with success at low depths indicates silent truncation. (Kept small; this is a secondary probe in Study 001.)

### 5.5 Operational telemetry (RQ4, descriptive only)

- Latency (TTFT, tokens/sec) and price recorded per request. Never used for fidelity verdicts; reported as the trade-off landscape.

**Total request budget (approximate):** per provider ≈ 180×3 (bench) + 300 (greedy) + 200 (logprob) + 80 (context) ≈ **1,320 requests**; × 10 providers ≈ 13,200 requests, plus reference runs. Estimated spend: £150–£400 in API costs + £150–£300 GPU rental. Cap declared: **£800 total**; if projected to exceed, drop providers beyond the 8 most-used rather than shrinking per-provider samples.

---

## 6. Statistical analysis and pre-declared verdicts

**Analysis per provider, all pre-declared:**

1. **Functional gap (RQ1):** paired difference in pass-rate vs reference across the 180 tasks; 95% CI by bootstrap (10,000 resamples, task-level). Practical-significance threshold: **Δ ≥ 3 percentage points** worse than reference.
2. **Greedy divergence (RQ2):** provider divergence distribution vs reference noise-floor distribution; Mann-Whitney U, effect size (rank-biserial). Threshold: median first-divergence index < 50% of the noise-floor median, p < 0.01.
3. **Logprob divergence (RQ2):** mean TV distance vs noise floor; same test family, p < 0.01.
4. **Multiple comparisons:** Holm–Bonferroni across providers within each probe family.
5. **Power check (pre-declared, performed in Stage B before freeze):** using calibration pass-rate estimates, verify ≥ 80% power to detect the 3 pp functional gap at α = 0.05 with 180 tasks × k=3. If underpowered, increase task count or k **before freeze — never after.** A study that cannot detect its own threshold is theater; this check is what makes the thresholds honest.

**Verdict categories (pre-declared, exhaustive):**

- **CONSISTENT** — no probe family crosses thresholds.
- **DIVERGENT — quality-affecting** — functional gap threshold crossed (with CI excluding zero) AND at least one distributional probe corroborates.
- **DIVERGENT — distribution-only** — distributional thresholds crossed but functional gap not established. Reported as such, explicitly *not* described as quality degradation.
- **TEMPLATE-CONFOUNDED** — divergence plausibly attributable to chat-template differences (Section 4).
- **CONSISTENT WITH ADVERTISED QUANTIZATION** — provider *discloses* a quantized endpoint and results match the corresponding secondary reference. This is honest serving and will be reported as such. The study's target is *undisclosed* degradation, and this category is what keeps the framing fair.
- **INSUFFICIENT DATA / N-A** — probe not applicable or request failures > 10%.

**Language rule:** the report states measurements and pre-declared category assignments with confidence intervals. It does not assert intent ("cheating", "fraud"). Mechanism language is limited to "consistent with the int4 reference profile".

**Null-result rule (pre-declared):** if all providers are CONSISTENT, the report is published anyway as "the state of provider fidelity for MODEL — and the open methodology for keeping it that way." The tool and leaderboard launch regardless; the business does not depend on scandal, it depends on continuous assurance.

---

## 7. Evidence integrity (the Invigil layer)

Every request/response pair in the study is logged as a leaf in a **sorted-pair Merkle tree** (keccak256; leaf = hash of canonical JSON: {timestamp, provider, endpoint slug, request hash, full response hash, params}). Per-day roots are computed; the sequence of daily roots is anchored in a single transaction batch on a low-cost L2 at study end (plus the methodology hash anchored at freeze, before data collection).

Published with the report: all roots + anchor tx hashes, the full probe corpus (public subset immediately; private task set after a 30-day window to allow provider reproduction), raw per-request logs for non-sensitive fields, and an **open-source verifier CLI** that recomputes roots from published logs and checks them against the on-chain anchors. Reviewers can verify the evidence was not edited after the fact. This section is deliberately the product demo embedded in the study.

---

## 8. Execution stages

- **Stage A — Setup (evenings, ~1 week):** provider accounts + ToS review; OpenAI-compatible adapter with per-provider config; sandbox runner; Merkle/receipt module (port from dissertation code); reference deployment scripted.
- **Stage B — Calibration (before freeze, ~1 week):** reference BF16 + fp8/int4 runs; noise-floor measurement; prompt-set selection; statistical power check (Section 6.5); **competitive scan** — search for any prior or concurrent published study of this exact shape (the aider 2024 quantization comparison and any successors), recorded in a "relation to prior work" section so the report positions as rigorous extension, never as unwitting duplicate; dry-run of 1 provider end-to-end; finalize MODEL and provider list. **Then freeze this document, hash it, anchor it (including the private task set root).**
- **Stage C — Data collection (~1–2 weeks elapsed, mostly automated):** full battery across all providers, spread per Section 3.
- **Stage D — Analysis & report (~1 week):** pre-declared analysis only; draft report; provider notice.
- **Stage E — Notice & publish:** each provider assigned a non-CONSISTENT verdict receives the findings concerning them + methodology **7 calendar days** before publication, with their response published verbatim (length-capped) alongside. Then: report + leaderboard + open-source tool + verifier CLI go live. **Distribution executed as a checklist, not an afterthought:** report has a 5-bullet TL;DR and one shareable headline chart; HN submission timed for a weekday morning US-time; simultaneous posts to the relevant ML/local-model communities; personal DMs to every lead collected during the archaeology phase, each pointing to the finding relevant to *their* stack; design-partner CTA form live before the post goes up.
- **Stage F — Validation gate (6 weeks post-publication, pre-declared):** continue/reassess criteria for the business itself — (a) ≥ 15 substantive inbound conversations, (b) ≥ 3 pilot-level discussions, (c) ≥ 1 signed *paid* pilot. All three met → build Phase 2 (Monitor tier). Some met → extend 4 weeks, iterate positioning. None met → the pain-to-budget hypothesis has failed its test; reassess the wedge before writing platform code. Deciding these thresholds now, while neutral, prevents both premature quitting and sunk-cost drifting later.

---

## 9. Risk register

| Risk | Mitigation (pre-declared) |
|---|---|
| Chat-template confound mimics degradation | Section 4 controls; TEMPLATE-CONFOUNDED verdict category exists precisely so this is never misreported |
| Reference itself nondeterministic | Noise-floor design; all tests are relative, never exact-match |
| Provider special-cases known benchmarks | 2/3 of functional tasks are private and fresh; public-vs-private agreement reported |
| Defamation exposure | Pre-registration, mechanical verdict rules, measurement-not-intent language, 7-day notice + right of reply, published raw evidence |
| ToS violation | Pre-freeze ToS review; exclude and disclose |
| Null result | Pre-declared publication path (Section 6) — leaderboard and tool launch regardless |
| Account-level special treatment | Second clean account re-verification for any non-CONSISTENT provider before publication |
| Provider caching masks generation behavior | k-run spacing ≥ 6h; no prompt mutation; caching noted as limitation |
| Provider changes backend/revision mid-study | `model` field recorded per request; split-window rule (Section 3) |
| Study account rate-limited or banned mid-run | Second account held in reserve; partial data handled by failure budget; event disclosed |
| Underpowered thresholds (study can't detect its own line) | Stage B power check gates the freeze (Section 6.5) |
| Cost overrun | £800 cap; drop providers, never per-provider sample size |

---

## 10. Operational & legal prerequisites (must be complete before Stage E publication)

Operational and legal prerequisites (entity, licensing review, provider ToS review,
secrets audit, prompt licensing/attribution) are tracked outside this repository and
gate Stage E publication. The scientific commitments of this document are unaffected
by their contents.

## 11. Deliverables checklist

- [ ] Frozen methodology (this doc) + on-chain hash anchor, **including private task set root**
- [ ] Stage B calibration artifacts: noise-floor data, power analysis, competitive scan notes
- [ ] Open-source repo: adapter, probe runner, sandbox, analysis notebooks, Merkle/verifier CLI
- [ ] Reference artifacts: pinned model revision, environment manifest, noise-floor data
- [ ] The report (findings, per-provider verdict cards, trade-off landscape, full methodology)
- [ ] Live leaderboard page (v0: static, regenerated weekly)
- [ ] Evidence bundle: logs, roots, anchor txs
- [ ] Design-partner CTA: "Want this run continuously on your stack? Taking 5 pilot partners."
