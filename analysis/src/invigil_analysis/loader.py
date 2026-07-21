"""Load evidence JSONL into DataFrames. JSONL is the source of truth
(SQLite was dropped -- pandas reads the log natively)."""
import json
import pathlib

import pandas as pd


def load_evidence(data_dir: str | pathlib.Path) -> pd.DataFrame:
    rows = []
    for f in sorted(pathlib.Path(data_dir, "evidence").glob("*.jsonl")):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    if not rows:
        raise ValueError(f"no evidence found under {data_dir}")
    return pd.DataFrame(rows)


def bench_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Per-(provider, task, rep) pass@1 from execution records."""
    ex = df[(df["kind"] == "execution") & (df["probe"] == "bench")].copy()
    if ex.empty:
        return pd.DataFrame(columns=["provider", "task_id", "rep", "passed_all"])
    ex["passed_all"] = (ex["passed"] == ex["total"]) & ex["exec_ok"]
    return ex[["provider", "task_id", "rep", "passed_all"]]


def pass_rates(bench: pd.DataFrame) -> pd.DataFrame:
    """Per-(provider, task) pass@1 estimate = mean over k reps."""
    return bench.groupby(["provider", "task_id"])["passed_all"].mean().rename("pass1").reset_index()


def greedy_texts(df: pd.DataFrame) -> pd.DataFrame:
    g = df[(df["probe"] == "greedy") & (df["kind"] == "generation") & (df["response_status"] == "ok")]
    return g[["provider", "prompt_id", "text"]]


def logprob_frames(df: pd.DataFrame) -> pd.DataFrame:
    g = df[(df["probe"] == "logprob") & (df["kind"] == "generation") & (df["response_status"] == "ok")]
    return g[["provider", "prompt_id", "logprobs"]]


def context_frame(df: pd.DataFrame) -> pd.DataFrame:
    g = df[(df["probe"] == "context") & (df["kind"] == "generation")]
    return g[["provider", "depth_pct", "trial", "retrieved", "response_status"]]
