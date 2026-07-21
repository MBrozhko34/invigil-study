# invigil-smoke-001: Results

**Status**: complete. Three runs executed 2026-07-21 to 2026-07-22, all evidence Merkle-committed.
**Scope disclaimer**: smoke study, laptop-only, no self-hosted reference. All findings are cross-provider comparisons in measurement language. No claim of degradation, no study-grade verdicts; those require the pre-registered Study 001 with a BF16 reference and its noise floor.

## 1. Summary

Five pinned providers serving `deepseek/deepseek-v4-flash` via OpenRouter were probed with four probe families across three committed runs (about 1,340 evidence records, total API cost under $0.08). Four results:

1. **Provider defaults silently change outcomes.** Under provider-default settings, two of five providers consumed the entire token budget on hidden reasoning and failed all long-context retrievals; with every parameter explicit, they succeeded on all of them. Same model ID, same request, materially different results from undisclosed server-side defaults.
2. **The dominant noise source is serving nondeterminism, now measured.** Identical temperature-0 prompts repeated against the same provider an hour apart are byte-identical only 60 to 67 percent of the time, for every provider. Byte-level output identity alone cannot rank providers.
3. **Above that noise floor, a stable behavioral ranking exists.** One provider matched the cross-provider consensus 100 percent of the time in both independent runs; another sat at 57 to 59 percent in both; the middle three held their order. A ranking that replicates across runs while self-agreement sits near 65 percent is differential signal, not noise.
4. **Easy tasks are a null; transparency varies.** All five providers pass all 15 easy coding tasks in every run (1,232 of 1,232 sandboxed test executions across the two clean runs) and retrieve needles at both depths under the explicit protocol. Only two of five providers expose logprobs at all.

## 2. Design

**Model**: deepseek/deepseek-v4-flash (MoE, open weights), chosen for heavy multi-homing. **Providers** (pinned via OpenRouter `provider.order` + `allow_fallbacks: false`, chosen to span advertised quantization tiers): DeepInfra and AtlasCloud (fp4), Baidu and WandB (fp8), Cloudflare (unspecified). The intended sixth arm, first-party DeepSeek, was excluded: the account used returns HTTP 404 for it on every request (account-level routing filter), and a guaranteed-dead arm would breach the 10 percent failure budget by construction.

**Probe families** per provider per run: 15 coding tasks x k=2 with sandboxed execution of generated code (30 units); 20 greedy prompts at temperature 0; 5 single-token logprob prompts; needle retrieval at 50 and 95 percent depth x 2 trials. 59 units per provider, 295 per run.

**Runs**:
- **Run 1** (provider defaults; archived `data-run1-provider-defaults/`): no explicit reasoning parameter, exposing default behavior.
- **Run 2** (clean protocol; `data/`): identical except `reasoning: {enabled: false}` set explicitly for all providers, per the methodology rule that every parameter is explicit and because three probe families structurally require direct answers.
- **Run 3** (replicate; `data-rep2/`): exact repeat of run 2, about 1.5 hours later, to measure run-to-run self-consistency.

Every request is an append-only canonical-JSON evidence record; each run's daily log is Merkle-rooted. Consensus rule (mechanical, pre-declared in `analysis/src/invigil_analysis/consensus.py`): a prompt has a consensus text iff a unique plurality of providers with count of at least 2 produced byte-identical output; agreement rates use only prompts with a consensus; intervals are 95 percent Wilson.

## 3. Results

### 3.1 The defaults effect (run 1 vs run 2)

| Provider | Needle retrieval, defaults (run 1) | Needle retrieval, explicit (run 2) | Greedy non-empty, defaults |
|---|---|---|---|
| AtlasCloud | 0/4 | 4/4 | 15/20 |
| Baidu | 0/4 | 4/4 | 17/20 |
| Cloudflare | 4/4 | 4/4 | 20/20 |
| DeepInfra | 4/4 | 4/4 | 20/20 |
| WandB | 3/3 | 4/4 | 19/19 |

With no reasoning parameter set, AtlasCloud and Baidu enabled reasoning by default and spent the completion budget before emitting an answer; DeepInfra and Cloudflare defaulted to direct answers. The buyer-relevant reading: two providers' out-of-the-box behavior failed 100 percent of long-context retrievals that identical requests passed elsewhere, and nothing in the response advertises why. Chart: `docs/charts/smoke-divergence.png` (panel A).

### 3.2 Functional benchmark and context (the honest null)

Every provider passed every sandboxed test in every run (runs 2 and 3 combined: 1,232/1,232 test executions; run 1 identical where responses arrived). Context retrieval under the explicit protocol: 4/4 for all providers in both clean runs. Fifteen easy tasks cannot separate providers serving a frontier-class model; discriminative power requires tasks where the reference model itself sits near 40 to 80 percent pass rate. This directly motivates the difficulty-calibrated task bank for Study 001.

### 3.3 Greedy consensus, the noise floor, and the replicated ranking

Agreement with cross-provider consensus (prompts with a consensus only):

| Provider | Run 2 | Run 3 (replicate) | Self-agreement across runs |
|---|---|---|---|
| WandB | 14/14 (100%) | 17/17 (100%) | 13/20 (65%) |
| Baidu | 13/14 (93%) | 14/17 (82%) | 13/20 (65%) |
| DeepInfra | 11/13 (85%) | 14/17 (82%) | 12/18 (67%) |
| AtlasCloud | 11/14 (79%) | 14/17 (82%) | 12/20 (60%) |
| Cloudflare | 8/14 (57%) | 10/17 (59%) | 13/20 (65%) |

Two facts must be read together. First, self-agreement near 65 percent for every provider means temperature-0 byte-identity is noisy for this MoE model even within a single provider; any analysis treating byte divergence as a per-request signal would be wrong. Second, despite that noise, the consensus ranking is stable across independent runs: WandB always lands on the consensus text when one exists, Cloudflare lands off it about 4 times in 10, in both runs. Providers with the same self-noise producing systematically different alignment to consensus is a reproducible behavioral fingerprint. What it fingerprints (kernel choices, quantization, batching policy, sampler implementation) cannot be attributed without the reference; the fingerprint's existence and stability is the smoke-scale finding. Confidence intervals overlap for middle ranks; only the top/bottom separation (WandB CI [82,100] vs Cloudflare CI [36,78] in run 3) is meaningfully wide, and it reproduced.

### 3.4 Logprob visibility

Three of five providers (AtlasCloud, Baidu, DeepInfra) do not expose logprobs; probes recorded as `na_capability` by design. The two that do (Cloudflare, WandB) agree on the top token on all 5 prompts with closely matching top-1 logprobs. The top-5 tail on both shows values quantized to exact 0.5 steps, a serving-stack artifact noted for the Study 001 methodology (logprob roundness as a potential quantization fingerprint). Observability itself is a rateable axis: a provider that exposes nothing is harder to verify and should be graded accordingly on disclosure.

### 3.5 Operational telemetry

Failure rates: run 2, 2 errors of 295 units (0.7 percent, transient DeepInfra 429s); run 3, 1 of 295 (0.3 percent, transient WandB 429). Median bench latency spread 1.8 to 2.9 seconds across providers. Reported model ID was correct on every successful response in all runs; no impostor model IDs observed. One anomaly for the billing-integrity roadmap: the context probe's builder targeted about 14,700 prompt tokens while providers reported about 8,700, a tokenizer discrepancy that must be understood before any billing claims.

## 4. Evidence integrity

Every record is canonical JSON, append-only, with sorted-pair keccak256 Merkle roots per day: run 1 root `0xb17673...dd3981` (445 leaves, includes run-2 date-shared log), replicate root `0xc0cabb...f675ca` (444 leaves). Signed receipts accompany each run; the standalone verifier recomputes roots from raw logs and rejects tampered bundles (covered by the e2e suite). Roots are file-committed; on-chain anchoring is reserved for Study 001.

## 5. Limitations

No self-hosted reference exists yet, so no provider can be called degraded, only different; the MoE model widens the nondeterminism floor relative to the dense model planned for Study 001; sample sizes are smoke-scale (14 to 20 consensus prompts) and most CIs overlap; all traffic transits OpenRouter, so provider attribution relies on OpenRouter's routing pins and any billing observations audit OpenRouter's accounting, not providers' directly; and the smoke plan, while committed before execution, is not the pre-registered Study 001 protocol.

## 6. What this changes for Study 001

Replicate runs are now a permanent design element (self-consistency is the cheapest honest control we have). Task difficulty must be calibrated to the 40 to 80 percent band against consensus or reference. Every provider-default divergence (reasoning behavior, logprob availability) becomes a disclosed, explicit parameter with the default behavior documented as its own finding. Logprob prompt count increases substantially for the two-plus providers that expose them, with the roundness fingerprint formalized.

## 7. Approved external claims (verbatim, cross-provider language only)

1. "Under provider defaults, two of five providers silently spent the entire token budget on hidden reasoning and failed 100 percent of long-context retrievals that identical requests passed elsewhere; making parameters explicit took them from 0 to 100 percent."
2. "On identical temperature-zero prompts, providers matched the cross-provider consensus between 57 and 100 percent of the time, and that ranking replicated across two independent runs while every provider's run-to-run self-agreement sat near 65 percent, the measured noise floor."
3. "Only two of five providers expose token logprobs; transparency is a rateable axis."
4. "All five providers pass all easy coding tasks; simple tasks do not separate providers, which is why the full study probes at the capability edge."
