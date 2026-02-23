"""Shared utility functions for district2 backend services."""

from config import NYC_OPENDATA_BASE


def socrata_url(dataset_id: str) -> str:
    return f"{NYC_OPENDATA_BASE}/{dataset_id}.json"


def safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
