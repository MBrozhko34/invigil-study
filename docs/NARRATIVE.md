# Invigil: from dissertation to the rating agency for AI compute

*The company story in one document. Written 2026-07-22. First person, Michael Brozhko. This is the canonical narrative that the YC application, the website, and investor conversations all draw from. Public-safe: everything here survives scrutiny against the evidence in this repository.*

## Act 1. I built the verification stack before I found the market

My MSc dissertation at Warwick (github.com/MBrozhko34/ai-zk-compute, graded 80) is a working decentralized ML marketplace: workers train models, generate Groth16 zero-knowledge proofs that their model hits a stated accuracy on committed data, and an on-chain orchestrator verifies the proofs and pays bounties. Circom circuits, Solidity contracts, the full pipeline, benchmarked end to end.

Building it taught me two things that define Invigil. First, the verification stack works and I can build all of it: commitments, statistical spot checks, and zero-knowledge proofs are complementary layers, not competing ones. Second, the fashionable version of this idea is impractical: proving a single LLM inference in zero knowledge costs roughly ten thousand times the inference itself, and proofs require the prover's cooperation, so a cheating provider simply never runs your prover. Anyone pitching per-request zkML proofs is selling something that cannot police an adversary. Verification has to work from the outside, without permission: statistics first, cryptographic escalation only when the stakes demand it.

## Act 2. The gap: nobody verifies what inference providers actually serve

While I was proving training runs, the inference market inverted. Open-weight models (DeepSeek, Qwen, Llama) are now served by dozens of competing providers at brutal margins. A provider can quietly serve a quantized version of the model it advertises, halve its GPU cost, and degrade quality in ways buyers feel but cannot attribute. The variance is public and documented: aider's benchmarks measured the same open model scoring differently across providers, OpenRouter labels endpoints by quantization precisely because precision differs between hosts, and developer forums are full of people comparing providers because they trust none of them.

The structural problem: the only parties measuring providers are marketplaces that sell the inference, and an aggregator auditing its own supply has a conflict it cannot remove. Observability tools watch your application, not your provider. Eval platforms rank models, not the people serving them. The seat for a neutral verifier is empty, and it is only open to someone who sells no inference.

The core insight that makes the problem tractable: the weights are open, so ground truth is knowable. Self-host the exact model at full precision, learn its behavioral fingerprint, then statistically compare every provider against it with probes indistinguishable from real traffic. Degradation leaves fingerprints: shifted pass rates, early greedy divergence, altered logprob distributions, failed long-context retrieval.

## Act 3. What is built and what it found (as of 2026-07-22)

The Integrity Index instrument is built, tested, and producing live data. A TypeScript and Python monorepo: a probe engine with four probe families (functional coding benchmark with sandboxed execution of model-generated code, greedy-decoding divergence, logprob fingerprinting, long-context needle retrieval); an append-only evidence log in canonical JSON with Merkle commitments, Ed25519-signed receipts, and on-chain anchoring on Base; a pre-registered statistical methodology with mechanical verdict rules; and an independent verifier CLI that recomputes everything from the raw log, so not even I can rewrite a finding. The end-to-end test plants a deliberately degraded provider and the pipeline convicts it, then rejects a tampered evidence bundle.

This week it ran live for the first time: five pinned providers serving deepseek/deepseek-v4-flash through OpenRouter, hundreds of cryptographically committed requests per run, evidence reconciled exactly against the pre-registered plan, failure rate under one percent. Three findings, stated in measurement language:

1. **Provider defaults silently change results.** With identical requests and no explicit reasoning parameter, two of five providers burned the entire token budget on hidden reasoning and retrieved the long-context needle in zero of four trials, while the other three retrieved it in every trial. Making every parameter explicit took those two providers from 0 percent to 100 percent retrieval. Same model ID, same request, materially different outcomes from undisclosed server-side defaults.
2. **Temperature-zero outputs are not reproducible across providers.** On identical greedy prompts, individual providers matched the cross-provider consensus between 57 and 100 percent of the time. No claim about who is wrong until the self-hosted reference exists; the spread itself is the finding.
3. **Verifiability itself varies.** Only two of five providers expose logprobs at all, and the visible distributions carry quantization-shaped artifacts worth a methodology note. Transparency is a rateable axis, not a given.

Equally honest: all five providers pass all fifteen easy coding tasks. Simple tasks do not separate providers; discriminative power lives at the capability edge, which is exactly what the full pre-registered study is designed to reach.

## Act 4. The company: a rating agency, built like one

Invigil is the independent rating agency for AI compute and AI service providers: the Moody's or UL of the inference economy. The Integrity Index is the first brick, not the product. A rating agency rates instruments and issuers; Invigil rates endpoints (a provider serving a specific model under a specific advertised configuration) and rolls endpoint grades up into provider grades, across axes that all run on the engine already built: serving fidelity, consistency, sampling honesty, context integrity, billing integrity (recounting tokens against what providers charge), drift over time, and disclosure honesty.

Three design rules make the grades defensible where credit ratings failed. Grades are a pure function of anchored evidence plus a versioned public rubric, so anyone running the verifier can recompute them; payment buys verification access, never the grade, and observed-tier ratings are computed for every provider whether they pay or not; and grade granularity is capped by statistical power, so Invigil never publishes a distinction its own confidence intervals cannot support.

The business ladder: the free public Integrity Index builds authority and the compounding fingerprint dataset. Monitor subscriptions for teams that need to know what their provider stack is serving. Attest adds signed, tamper-evident receipts on production traffic. Certify inverts the customer base: providers pay for independent verification because enterprises write "must maintain an Invigil grade" into procurement, the same flip SOC 2 made from optional to mandatory. Entry wedge: paid provider audits that convert to monitoring. As AI regulation matures, a pre-registered, recomputable, publicly anchored methodology is exactly what an accreditation regime will require; Invigil is building that file from day one.

## Act 5. The plan

Next: the pre-registered public study. One heavily multi-homed open model, six to ten providers, a self-hosted BF16 reference with a measured noise floor, powered at 300 tasks by five samples, seven-day provider notice with verbatim right of reply, every request committed and anchored. It publishes whatever it finds; a null result is a credibility asset. The study is the launch: press, the first cited index, and design partners recruited by the findings themselves. Monitoring follows for those partners on the same pipeline. The watchtower is the deterrent; that is the business.
