"""Bounded Lighthouse performance audit over a dedicated Chromium debug-port process."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from playwright.async_api import async_playwright

from .passive import Issue

METRICS = {"largest-contentful-paint": "LCP", "cumulative-layout-shift": "CLS",
           "total-blocking-time": "TBT", "first-contentful-paint": "FCP", "speed-index": "SI"}
BUDGETS = {"LCP": 2500.0, "CLS": 0.1}
VITAL_BUDGETS = {"LCP": 2500.0, "CLS": 0.1, "INP": 200.0, "TTFB": 800.0}


def _strip(url: object) -> str:
    p = urlparse(str(url or ""))
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def sanitize_report(data: dict) -> dict:
    """What we store: scores, metric values and opportunity savings. Screenshots, request URLs, DOM snippets and
    page text are dropped, since on an authenticated site they can hold personal data."""
    keep = ("id", "title", "score", "scoreDisplayMode", "numericValue", "numericUnit", "displayValue")
    audits = {}
    for audit_id, audit in (data.get("audits") or {}).items():
        if not isinstance(audit, dict):
            continue
        clean = {k: audit[k] for k in keep if k in audit}
        details = audit.get("details")
        if isinstance(details, dict) and details.get("type") == "opportunity":
            clean["details"] = {"type": "opportunity", "overallSavingsMs": details.get("overallSavingsMs")}
        audits[audit_id] = clean
    perf = (data.get("categories") or {}).get("performance") or {}
    return {"lighthouseVersion": data.get("lighthouseVersion"), "fetchTime": data.get("fetchTime"),
            "requestedUrl": _strip(data.get("requestedUrl")), "finalUrl": _strip(data.get("finalUrl")),
            "categories": {"performance": {"score": perf.get("score")}}, "audits": audits}


def _band(score: object) -> str:
    """Lighthouse's own colour bands for metrics without a Core Web Vitals budget: >= 0.9 good, 0.5-0.9 needs
    improvement, < 0.5 poor."""
    if not isinstance(score, (int, float)):
        return "not applicable"
    return "passed" if score >= 0.9 else "needs improvement" if score >= 0.5 else "failed"


def parse_report(data: dict, page: str) -> tuple[dict, list[Issue]]:
    """Single-run lab metrics. Only LCP and CLS use published Core Web Vitals thresholds."""
    category = (data.get("categories") or {}).get("performance") or {}
    if not isinstance(data.get("audits"), dict) or category.get("score") is None:
        raise ValueError("Lighthouse performance category missing")
    audits = data["audits"]
    metrics, issues = {}, []
    for audit_id, name in METRICS.items():
        audit = audits.get(audit_id) or {}
        value = audit.get("numericValue")
        status = "not run" if not isinstance(value, (int, float)) else \
            "failed" if name in BUDGETS and value > BUDGETS[name] else \
            "passed" if name in BUDGETS else \
            _band(audit.get("score"))
        metrics[name] = {"value": round(value, 2) if isinstance(value, (int, float)) else None,
                         "unit": "score" if name == "CLS" else "ms", "status": status,
                         "budget": BUDGETS.get(name)}
        if name in BUDGETS and status == "failed":
            issues.append(Issue(f"lighthouse:{name}", "perf", "medium", f"{name} budget exceeded on {page}",
                                f"Measured {name} {value:.2f}; good threshold is {BUDGETS[name]}.",
                                urlparse(page).path or "/", {"metric": name, "value": value,
                                                                "budget": BUDGETS[name], "page": page}))
    opportunities = [{"name": item.get("title"), "saving_ms": round(item["details"]["overallSavingsMs"])}
                     for item in audits.values() if isinstance(item, dict) and
                     isinstance(item.get("details"), dict) and item["details"].get("type") == "opportunity" and
                     isinstance(item["details"].get("overallSavingsMs"), (int, float))]
    opportunities.sort(key=lambda item: -item["saving_ms"])
    score = round(float(category["score"]) * 100)
    return {"page": page, "score": score, "metrics": metrics, "opportunities": opportunities[:5]}, issues


def parse_vitals(data: list[dict]) -> tuple[list[dict], list[Issue]]:
    if not isinstance(data, list):
        raise ValueError("web-vitals report must be a list")
    rows, issues = [], []
    for page in data:
        if not isinstance(page, dict):
            continue
        path = str(page.get("path") or "/")
        metrics = page.get("metrics") or {}
        for name, budget in VITAL_BUDGETS.items():
            item = metrics.get(name) or {}
            value = item.get("value")
            status = "not run" if not isinstance(value, (int, float)) else "failed" if value > budget else "passed"
            rows.append({"path": path, "metric": name, "value": round(value, 2) if isinstance(value, (int, float)) else None,
                         "budget": budget, "status": status, "source": "single browser journey"})
            if status == "failed":
                issues.append(Issue(f"web-vitals:{name}", "perf", "medium", f"{name} budget exceeded on {path}",
                                    f"Measured {name} {value:.2f}; good threshold is {budget}.", path,
                                    {"metric": name, "value": value, "budget": budget, "path": path}))
    return rows, issues


async def scan(base_url: str, paths: list[str], allowed_hosts: set[str], out_dir: Path) -> tuple[list[tuple[Path, dict, list[Issue]]], str]:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.hostname.lower() not in allowed_hosts:
        return [], "target outside allowlist"
    root = Path(__file__).resolve().parents[3]
    cli = root / "apps" / "web" / "node_modules" / "lighthouse" / "cli" / "index.js"
    if not cli.is_file() or not shutil.which("node"):
        return [], "Lighthouse CLI unavailable"
    urls = []
    for path in ["/", *paths]:
        url = urljoin(base_url, path)
        p = urlparse(url)
        if p.scheme in {"http", "https"} and p.hostname and p.hostname.lower() in allowed_hosts:
            clean = urlunparse((p.scheme, p.netloc, p.path or "/", "", "", ""))
            if clean not in urls:
                urls.append(clean)
        if len(urls) == 4:
            break
    out_dir.mkdir(parents=True, exist_ok=True)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    host_rules = "MAP * ~NOTFOUND, " + ", ".join(f"EXCLUDE {host}" for host in sorted(allowed_hosts))
    # DNS rules miss IP-literal URLs (a redirect to http://10.0.0.5/ never resolves a name). Sending every request
    # through a dead proxy, except allowlisted hosts, blocks those too; <-loopback> removes Chrome's implicit
    # localhost bypass so only an allowlisted localhost is reachable.
    bypass = ";".join(["<-loopback>", *sorted(allowed_hosts)])
    deadline = time.monotonic() + int(os.getenv("LIGHTHOUSE_MAX_SECONDS", "240"))
    reports = []
    async with async_playwright() as pw:
        browser = None
        channels = [os.getenv("PLAYWRIGHT_CHANNEL"), "chrome", "msedge", None]
        for channel in dict.fromkeys(channels):
            try:
                browser = await pw.chromium.launch(channel=channel, headless=True, args=[
                    f"--remote-debugging-port={port}", f"--host-resolver-rules={host_rules}",
                    "--proxy-server=http://127.0.0.1:9", f"--proxy-bypass-list={bypass}",
                    "--disable-background-networking", "--disable-sync", "--disable-extensions"])
                break
            except Exception:
                continue
        if browser is None:
            return [], "Chromium unavailable"
        try:
            ready = False
            async with httpx.AsyncClient(timeout=1) as client:
                for _ in range(20):
                    try:
                        ready = (await client.get(f"http://127.0.0.1:{port}/json/version")).status_code == 200
                    except httpx.HTTPError:
                        pass
                    if ready:
                        break
                    await asyncio.sleep(.5)
            if not ready:
                return [], "Chromium debug port unavailable"
            notes = []
            for index, url in enumerate(urls):
                if deadline - time.monotonic() < 5:
                    notes.append("lane time limit")
                    break
                report = out_dir / f"lighthouse-{index}.json"
                command = [shutil.which("node") or "node", str(cli), url, f"--port={port}",
                           "--output=json", f"--output-path={report}", "--only-categories=performance",
                           "--preset=desktop", "--quiet"]
                proc = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.DEVNULL,
                                                            stderr=asyncio.subprocess.DEVNULL)
                try:
                    await asyncio.wait_for(proc.wait(), timeout=min(60, deadline - time.monotonic()))  # heavy SPAs need ~40 s
                except TimeoutError:
                    proc.kill()
                    await proc.wait()
                    notes.append(f"page {index + 1} timed out")
                    continue
                if not report.is_file():
                    notes.append(f"page {index + 1} unavailable")
                    continue
                why = ""
                try:
                    raw = json.loads(report.read_text(encoding="utf-8"))
                    why = str((raw.get("runtimeError") or {}).get("code") or "")  # e.g. NO_FCP, ERRORED_DOCUMENT_REQUEST
                    data = sanitize_report(raw)
                    del raw
                    report.write_text(json.dumps(data), encoding="utf-8")  # only the sanitised report persists
                    summary, issues = parse_report(data, url)
                    reports.append((report, summary, issues))
                except (OSError, ValueError, TypeError):
                    report.unlink(missing_ok=True)  # never leave an unsanitised report behind
                    notes.append(f"{urlparse(url).path or '/'} not measured" + (f" ({why})" if why else ""))
            return reports, f"{len(reports)}/{len(urls)} pages measured" + ("; " + "; ".join(notes) if notes else "")
        finally:
            await browser.close()
