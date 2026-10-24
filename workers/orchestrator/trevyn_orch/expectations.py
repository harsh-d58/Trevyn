"""Expected vs actual for scanner findings: what the rule requires, and what was actually observed.

Each engine's Issue carries the facts in `evidence`; this turns them into two sentences so a finding never repeats
one message as both its expectation and its observation."""
from __future__ import annotations

from .passive import Issue

PASSIVE_EXPECTED = {
    "P1": "Every page sends a Content-Security-Policy header that limits where scripts may load from.",
    "P2": "Pages refuse to be framed by other sites (X-Frame-Options or CSP frame-ancestors).",
    "P3": "HTTPS pages send Strict-Transport-Security so browsers never fall back to plain HTTP.",
    "P4": "Responses send X-Content-Type-Options: nosniff.",
    "P5": "Session cookies are HttpOnly, Secure (on HTTPS) and SameSite.",
    "P6": "Server and X-Powered-By headers do not reveal software versions.",
    "P7": "An HTTPS page loads every resource over HTTPS.",
    "P8": "The page logs no JavaScript errors while a user journey runs.",
    "P9": "The application answers every request without a 5xx server error.",
}


def _first(items, default="") -> str:
    return str(items[0]) if isinstance(items, list) and items else default


def describe(issue: Issue) -> tuple[str, str]:
    """(expected, actual) for one issue. Falls back to the title and message if a rule is unknown."""
    rule, ev, where = issue.rule, issue.evidence or {}, issue.path or "/"
    if rule in PASSIVE_EXPECTED:
        expected = PASSIVE_EXPECTED[rule]
        if rule in ("P1", "P2", "P3", "P4"):
            actual = f"{ev.get('header', 'header')} was missing on {ev.get('url', where)}."
        elif rule == "P5":
            actual = f"Cookie '{ev.get('cookie')}' on {ev.get('url', where)} lacks {', '.join(ev.get('missing') or [])}."
        elif rule == "P6":
            actual = f"{ev.get('header')}: {ev.get('value')} on {ev.get('url', where)}."
        elif rule == "P7":
            actual = f"{ev.get('url')} was loaded over plain HTTP during {ev.get('case', 'a journey')}."
        elif rule == "P8":
            actual = f"{ev.get('count', 1)} console error(s) during {ev.get('case', 'a journey')}; first: {str(ev.get('first', ''))[:160]}"
        else:
            actual = f"{ev.get('method', 'GET')} {ev.get('url', where)} returned {ev.get('status')} during {ev.get('case', 'a journey')}."
        return expected, actual
    if rule.startswith("zap:"):
        cwe = f" (CWE-{ev['cwe']})" if ev.get("cwe") else ""
        urls = ev.get("urls") or []
        return (f"No '{issue.title}' issue{cwe}: ZAP passive rule {ev.get('plugin_id', rule[4:])} passes.",
                f"ZAP reported it on {len(urls)} URL(s), e.g. {_first(urls, where)} (confidence {ev.get('confidence', 'unknown')}).")
    if rule.startswith("axe:"):
        wcag = ", ".join(ev.get("wcag") or []) or "WCAG"
        return (f"The page meets accessibility rule {rule[4:]} ({wcag}): {issue.title}.",
                f"{ev.get('node_count', 0)} element(s) on {where} violate it (impact: {ev.get('impact', 'unknown')}).")
    if rule.startswith(("lighthouse:", "web-vitals:")):
        unit = "" if ev.get("metric") == "CLS" else " ms"
        page = ev.get("page") or ev.get("path") or where
        return (f"{ev.get('metric')} stays within the good threshold of {ev.get('budget')}{unit}.",
                f"Measured {ev.get('metric')} = {round(float(ev.get('value') or 0), 2)}{unit} on {page}.")
    if rule.startswith("osv:"):
        n = len(ev.get("advisories") or [])
        fix = f"; fixed in {ev['fixed_version']}" if ev.get("fixed_version") else "; no fixed version published"
        cves = ", ".join((ev.get("aliases") or [])[:4])
        return (f"Dependency {ev.get('package')} has no known vulnerabilities.",
                f"{ev.get('package')}@{ev.get('version')} matches {n} advisory(ies){' (' + cves + ')' if cves else ''}{fix}.")
    if rule.startswith("gitleaks:"):
        return ("The repository contains no committed secrets.",
                f"Gitleaks rule {ev.get('rule')} matched in {ev.get('file')}:{ev.get('line') or '?'} (value redacted).")
    return issue.title, issue.message
