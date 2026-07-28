# Consensus ranking (auto-generated)

Regenerate with `pnpm rank`. Reference-free: alignment to the cross-provider
consensus text, never a quality verdict. Ranking rule (mechanical): pooled
consensus-match rate across both committed runs, 95% Wilson CI, ties broken
by lower CI bound. Discussion and approved claims: `docs/SMOKE-RESULTS.md`.

Model: deepseek/deepseek-v4-flash · 5 providers · 2 committed runs · 889 evidence records

| # | provider | advertised tier | pooled alignment | 95% CI | run 2 | run 3 | self-agreement | bench | context | logprobs |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | or-wandb | fp8 | 31/31 (100%) | [89%, 100%] | 14/14 | 17/17 | 13/20 (65%) | 244/244 | 8/8 | yes |
| 2 | or-baidu | fp8 | 27/31 (87%) | [71%, 95%] | 13/14 | 14/17 | 13/20 (65%) | 248/248 | 8/8 | no |
| 3 | or-deepinfra | fp4 | 25/30 (83%) | [66%, 93%] | 11/13 | 14/17 | 12/18 (67%) | 248/248 | 8/8 | no |
| 4 | or-atlascloud | fp4 | 25/31 (81%) | [64%, 91%] | 11/14 | 14/17 | 12/20 (60%) | 248/248 | 8/8 | no |
| 5 | or-cloudflare | unknown | 18/31 (58%) | [41%, 74%] | 8/14 | 10/17 | 13/20 (65%) | 248/248 | 8/8 | yes |

Self-agreement is the temperature-0 run-to-run noise floor (run 2 vs run 3, same prompts, same provider). Bench and context are pooled over both runs.

Evidence merkle roots: `0xb17673b63a62a9cd9f186a71297e4e05ffc5080bb0bb86fe69a0638139dd3981` (445 leaves); `0xc0cabb33fd4c0c19090fa759255eca4607ea6c4152a9c6a6b802e3de1af675ca` (444 leaves)
