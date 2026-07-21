# Reference lab

Runs on a RENTED GPU BOX (RunPod / Lambda), not your laptop and not CI.
Sessions are batch jobs: rent, run, download artifacts, terminate.
Target hardware: 1x H100 80GB (BF16 32B fits with headroom). Both noise-floor
reference runs MUST use the same GPU type (METHODOLOGY section 4).

Session recipe:
  1. bash deploy_vllm.sh            # pin + serve the reference model
  2. python run_reference.py --run-id ref-bf16-a
  3. python run_reference.py --run-id ref-bf16-b   # separate day/instance -> noise floor
  4. python quantized_refs.py       # fp8 + int4 secondary references
  5. python prompt_selection.py     # Stage B: pick divergence-prone greedy prompts
  6. scp data/evidence/*.jsonl back to the laptop repo

Output is the SAME canonical-JSON evidence format the TS runner produces
(provider id "reference-bf16-a" etc.), so analysis and the verifier treat
reference and provider data identically.
