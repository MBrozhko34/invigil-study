"""Noise floor (METHODOLOGY section 4): the distribution of divergence between
TWO reference runs of the same weights on the same GPU type. All provider
comparisons are relative to this -- never to an assumption of exact match."""
import pandas as pd

from .divergence import first_divergence_index


def divergence_distribution(texts: pd.DataFrame, provider_a: str, provider_b: str) -> pd.Series:
    a = texts[texts["provider"] == provider_a].set_index("prompt_id")["text"]
    b = texts[texts["provider"] == provider_b].set_index("prompt_id")["text"]
    common = a.index.intersection(b.index)
    if len(common) == 0:
        raise ValueError(f"no common prompts between {provider_a} and {provider_b}")
    return pd.Series(
        [first_divergence_index(a[p], b[p]) for p in common],
        index=common, name=f"{provider_a}~{provider_b}",
    )
