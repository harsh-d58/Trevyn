"""Passive checks (PHASE1 A7, PLAN_MODES §4.4 lane `security_passive`). Pure software, no AI: facts read from responses
the target already sends. Each rule yields at most one finding per run; results are deterministic, so they are reported
as confirmed with the exact header or request as evidence."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx

SESSION_COOKIE = re.compile(r"(sess|sid|token|auth|jwt|login)", re.I)
VERSION_LEAK = re.compile(r"\d+\.\d+")
MAX_PAGES = 5


@dataclass
class Response:
    url: str
    status: int
    headers: dict[str, str]
    cookies: list[str] = field(default_factory=list)  # raw Set-Cookie values


@dataclass
class Issue:
    rule: str
    category: str  # security | network | ui
    severity: str  # high | medium | low
    title: str
    message: str
    path: str
    evidence: dict
    evidence_ids: list[str] = field(default_factory=list)


def _h(r: Response, name: str) -> str | None:
    return next((v for k, v in r.headers.items() if k.lower() == name), None)


def header_rules(responses: list[Response]) -> list[Issue]:
    """P1-P7 over document responses. One issue per rule, reported for the first page that shows it."""
    issues: dict[str, Issue] = {}

    def add(rule, sev, title, msg, r, ev):
        if rule not in issues:
            issues[rule] = Issue(rule, "security", sev, title, msg, urlparse(r.url).path or "/", {"url": r.url, **ev})

    for r in responses:
        if r.status >= 400:
            continue
        https = urlparse(r.url).scheme == "https"
        csp = _h(r, "content-security-policy")
        if not csp:
            add("P1", "medium", "Missing Content-Security-Policy header", "The page sends no Content-Security-Policy, so injected scripts are not restricted.", r, {"header": "content-security-policy", "value": None})
        if not _h(r, "x-frame-options") and not (csp and "frame-ancestors" in csp):
            add("P2", "medium", "Page can be framed (clickjacking)", "No X-Frame-Options header and no CSP frame-ancestors directive.", r, {"header": "x-frame-options", "value": None})
        if https and not _h(r, "strict-transport-security"):
            add("P3", "medium", "Missing Strict-Transport-Security header", "HTTPS page without HSTS, so the first visit can be downgraded to HTTP.", r, {"header": "strict-transport-security", "value": None})
        if (_h(r, "x-content-type-options") or "").lower() != "nosniff":
            add("P4", "low", "Missing X-Content-Type-Options: nosniff", "Browsers may guess content types, which enables some injection tricks.", r, {"header": "x-content-type-options", "value": _h(r, "x-content-type-options")})
        for c in r.cookies:
            name = c.split("=", 1)[0].strip()
            low = c.lower()
            missing = [f for f, ok in (("HttpOnly", "httponly" in low), ("Secure", "secure" in low or not https), ("SameSite", "samesite" in low)) if not ok]
            if SESSION_COOKIE.search(name) and missing:
                add("P5", "medium", f"Session cookie '{name}' lacks {', '.join(missing)}", "Session cookies should be HttpOnly, Secure (on HTTPS) and SameSite.", r, {"cookie": name, "missing": missing})
        for hdr in ("server", "x-powered-by"):
            v = _h(r, hdr)
            if v and VERSION_LEAK.search(v):
                add("P6", "low", f"{hdr} header reveals a version", f"'{hdr}: {v}' tells attackers which software version to target.", r, {"header": hdr, "value": v})
    return list(issues.values())


def network_rules(cases: list[tuple[str, list[dict], list[dict]]], host: str) -> list[Issue]:
    """P7-P9 from a run's captured traffic: (case_id, network entries, console entries) per case.
    Network entries are the runner's network.json rows: {t, method, path, url, status?}."""
    issues: dict[str, Issue] = {}
    for case_id, net, console in cases:
        for n in net:
            u = urlparse(n.get("url", ""))
            if "P7" not in issues and u.scheme == "http" and any(urlparse(m.get("url", "")).scheme == "https" for m in net[:1]):
                issues["P7"] = Issue("P7", "security", "medium", "Mixed content on an HTTPS page", "An HTTPS page loaded a resource over plain HTTP.",
                                     u.path or "/", {"case": case_id, "url": n["url"]})
            if "P9" not in issues and (n.get("status") or 0) >= 500 and u.hostname == host:
                issues["P9"] = Issue("P9", "network", "high", f"Server error {n['status']} on {n.get('method', 'GET')} {u.path}",
                                     "The application answered a request with a 5xx server error during a test journey.",
                                     u.path or "/", {"case": case_id, "method": n.get("method"), "url": n["url"], "status": n["status"]})
        errors = [c for c in console if c.get("type") == "error"]
        if errors and "P8" not in issues:
            issues["P8"] = Issue("P8", "ui", "medium", f"JavaScript errors in the console ({len(errors)})",
                                 "The page logged errors while a test journey ran; these often hide broken features.",
                                 "/", {"case": case_id, "first": errors[0].get("text", "")[:300], "count": len(errors)})
    return list(issues.values())


async def fetch_pages(base_url: str, paths: list[str], allowed_hosts: list[str], timeout_s: float = 10.0) -> list[Response]:
    """GET up to MAX_PAGES same-site pages. Redirects are followed by hand so a hop off the allowlist stops the fetch."""
    out: list[Response] = []
    seen: set[str] = set()
    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False, headers={"User-Agent": "Trevyn-QA/0.1 (passive checks)"}) as c:
        for p in (["/"] + paths)[: MAX_PAGES * 2]:
            url = urljoin(base_url.rstrip("/") + "/", p.lstrip("/"))
            if url in seen or len(out) >= MAX_PAGES:
                continue
            seen.add(url)
            for _ in range(4):  # at most 3 redirects
                if urlparse(url).hostname not in allowed_hosts:
                    break
                try:
                    r = await c.get(url)
                except httpx.HTTPError:
                    break
                if r.is_redirect and "location" in r.headers:
                    url = urljoin(url, r.headers["location"])
                    continue
                out.append(Response(str(r.url), r.status_code, dict(r.headers), r.headers.get_list("set-cookie")))
                break
    return out
