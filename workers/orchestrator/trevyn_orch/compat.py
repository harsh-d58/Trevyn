"""Deterministic compatibility result parser."""
from __future__ import annotations


def parse_matrix(data: dict) -> list[dict]:
    if not isinstance(data.get("rows"), list):
        raise ValueError("compatibility report has no rows")
    rows = []
    for row in data["rows"]:
        # errored = the case ran in that browser but a step could not complete (not a pass, not a confirmed failure)
        if not isinstance(row, dict) or row.get("status") not in {"passed", "failed", "errored", "not run"}:
            continue
        rows.append({"case": str(row.get("case") or ""), "browser": str(row.get("browser") or ""),
                     "status": row["status"], "note": str(row.get("note") or "")[:160]})
    return rows
