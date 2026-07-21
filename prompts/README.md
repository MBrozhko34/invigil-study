Greedy corpus (300 prompts) and logprob corpus (200 prompts) are finalized at
Stage B calibration: `reference-lab/prompt_selection.py` over-weights prompts
where the fp8/int4 secondary references diverge early from BF16
(METHODOLOGY section 5.2). Files here are format exemplars.
