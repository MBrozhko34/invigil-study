# Latest smoke results (auto-generated)

Regenerate with `pnpm report` (or `bash scripts/report.sh`). Numbers only; discussion and approved claims: `docs/SMOKE-RESULTS.md`.

## Runs

| run | dir | gen units | ok | errors | na | merkle roots |
|---|---|---|---|---|---|---|
| provider defaults | data-run1-provider-defaults | 354 | 271 | 68 | 15 | 2026-07-21: `0xed30e856d9e15b6232d75daae967466f05a9cdbc0ce6eb31eaaece3b7ba506f4` (498 leaves) |
| clean protocol | data | 295 | 278 | 2 | 15 | 2026-07-21: `0xb17673b63a62a9cd9f186a71297e4e05ffc5080bb0bb86fe69a0638139dd3981` (445 leaves) |
| replicate | data-rep2 | 295 | 279 | 1 | 15 | 2026-07-22: `0xc0cabb33fd4c0c19090fa759255eca4607ea6c4152a9c6a6b802e3de1af675ca` (444 leaves) |

`model_reported` on all ok responses: deepseek/deepseek-v4-flash

## Per-provider results

| provider | bench (clean) | bench (rep) | context (defaults) | context (clean) | context (rep) | consensus match (clean) | consensus match (rep) | self-agreement |
|---|---|---|---|---|---|---|---|---|
| or-atlascloud | 124/124 | 124/124 | 0/4 | 4/4 | 4/4 | 11/14 (79%) | 14/17 (82%) | 12/20 (60%) |
| or-baidu | 124/124 | 124/124 | 0/4 | 4/4 | 4/4 | 13/14 (93%) | 14/17 (82%) | 13/20 (65%) |
| or-cloudflare | 124/124 | 124/124 | 4/4 | 4/4 | 4/4 | 8/14 (57%) | 10/17 (59%) | 13/20 (65%) |
| or-deepinfra | 124/124 | 124/124 | 4/4 | 4/4 | 4/4 | 11/13 (85%) | 14/17 (82%) | 12/18 (67%) |
| or-wandb | 124/124 | 120/120 | 3/3 | 4/4 | 4/4 | 14/14 (100%) | 17/17 (100%) | 13/20 (65%) |

Greedy prompts: 20; unanimous: 7; with consensus: 14 (replicate: 8 unanimous, 17 with consensus)

## Logprob availability

| provider | exposes logprobs |
|---|---|
| or-atlascloud | no |
| or-baidu | no |
| or-cloudflare | yes |
| or-deepinfra | no |
| or-wandb | yes |

