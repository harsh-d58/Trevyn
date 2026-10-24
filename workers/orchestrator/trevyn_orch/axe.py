"""Parse the runner's vendored axe-core WCAG 2.1 A/AA output."""
from __future__ import annotations

from .passive import Issue


def parse_report(data: list[dict]) -> list[Issue]:
    if not isinstance(data, list):
        raise ValueError("axe report must be a list of page results")
    issues: dict[str, Issue] = {}
    for page in data:
        if not isinstance(page, dict):
            continue
        path = str(page.get("path") or "/")
        for item in page.get("violations", []):
            rule_id = str(item.get("id") or "")
            if not rule_id:
                continue
            rule = "axe:" + rule_id
            count = int(item.get("nodes") or 0)
            if rule in issues:
                issues[rule].evidence["node_count"] += count
                continue
            impact = str(item.get("impact") or "unknown")
            severity = {"critical": "high", "serious": "medium", "moderate": "low", "minor": "low"}.get(impact, "low")
            detail = {"impact": impact, "help_url": str(item.get("helpUrl") or ""),
                      "wcag": [tag for tag in item.get("tags", []) if str(tag).startswith("wcag")],
                      "node_count": count}
            title = str(item.get("help") or rule_id)[:300]
            issues[rule] = Issue(rule, "accessibility", severity, title,
                                 f"axe-core found {count} affected nodes for {rule_id}", path, detail)
    return list(issues.values())
