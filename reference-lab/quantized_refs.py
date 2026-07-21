#!/usr/bin/env python3
"""Secondary references (METHODOLOGY section 4): fp8 and int4 runs of the SAME
pinned weights. Used descriptively ("provider X most resembles the int4
profile"), never for verdicts.

Serve each precision, then reuse run_reference.py:
  vllm serve $MODEL --revision $REVISION --quantization fp8  --port 8001
  python run_reference.py --run-id ref-fp8  --base-url http://127.0.0.1:8001/v1
  # int4: serve an AWQ export of the same revision, run with --run-id ref-int4
This file documents the exact serving commands per precision so the report can
cite them; keep it in sync with what you actually ran.
"""
print(__doc__)
