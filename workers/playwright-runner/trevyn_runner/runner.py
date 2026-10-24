"""Playwright step interpreter (Part 9.1). Interprets the whitelisted Step vocabulary; never runs model-written code.
Exit/`status` is infra-level only: failed assertions are data, not errors."""
from __future__ import annotations

import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from playwright.async_api import Page, async_playwright

from trevyn_contracts import (AssertionResult, CaseResult, DupPost, RunnerJob, RunnerResult, StepResult, TestCase)
from .browser import launch

SECRET_RE = re.compile(r"(eyJ[\w-]+\.[\w-]+\.[\w-]+|Bearer\s+\S+|(?i:password|token|secret)=[^&\s]+)")
DUP_WINDOW_MS = 2000


def redact(text: str) -> str:
    return SECRET_RE.sub("[REDACTED]", text)


def locate(page: Page, target: str):
    kind, _, rest = target.partition("=")
    if kind == "role":
        m = re.match(r"(\w+)(?:\[name=(.+)\])?$", rest)
        role, name = (m.group(1), m.group(2)) if m else (rest, None)
        return page.get_by_role(role, name=name, exact=False) if name else page.get_by_role(role)
    return {"label": lambda: page.get_by_label(rest), "testid": lambda: page.get_by_test_id(rest),
            "text": lambda: page.get_by_text(rest), "css": lambda: page.locator(rest)}.get(kind, lambda: page.locator(target))()


def compare(observed, op: str, expected) -> bool:
    try:
        if op == "eq":
            return str(observed) == str(expected) if isinstance(expected, str) else float(observed) == float(expected)
        if op == "lte":
            return float(observed) <= float(expected)
        if op == "gte":
            return float(observed) >= float(expected)
        if op == "contains":
            return str(expected).lower() in str(observed).lower()
        if op == "matches":
            return re.search(str(expected), str(observed)) is not None
    except (TypeError, ValueError):
        return False
    return False


async def hook_count(job: RunnerJob, name: str) -> int | None:
    if not job.target.hook_url:
        return None
    headers = {"X-Trevyn-Token": job.target.hook_token} if job.target.hook_token else {}
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{job.target.hook_url}/{name}", headers=headers)
        return r.json().get("count") if r.status_code == 200 else None


async def hook_reset(job: RunnerJob) -> bool:
    if not job.target.hook_url:
        return False
    headers = {"X-Trevyn-Token": job.target.hook_token} if job.target.hook_token else {}
    async with httpx.AsyncClient(timeout=10) as c:
        return (await c.post(f"{job.target.hook_url}/reset", headers=headers)).status_code == 200


async def run_case(browser, job: RunnerJob, tc: TestCase, out: Path) -> CaseResult:
    allowed = set(job.target.allowed_hosts)
    res = CaseResult(test_case_id=tc.test_case_id, outcome="passed")
    net: list[dict] = []
    console: list[dict] = []
    ctx = await browser.new_context(viewport={"width": 1280, "height": 800})

    async def guard(route):
        host = urlparse(route.request.url).hostname or ""
        if host in allowed:
            await route.continue_()
        else:
            res.egress_blocked.append(host)
            await route.abort()

    await ctx.route("**/*", guard)
    await ctx.tracing.start(screenshots=True, snapshots=True, sources=False)
    page = await ctx.new_page()
    t0 = time.monotonic()
    page.on("request", lambda r: net.append({"t": int((time.monotonic() - t0) * 1000), "method": r.method,
                                             "path": urlparse(r.url).path, "url": redact(r.url)}))
    page.on("response", lambda r: next((n.__setitem__("status", r.status) for n in reversed(net)
                                         if n["url"] == redact(r.url) and "status" not in n), None))
    page.on("requestfailed", lambda r: setattr(res, "failed_requests", res.failed_requests + 1))
    page.on("console", lambda m: console.append({"type": m.type, "text": redact(m.text)}))
    page.on("pageerror", lambda e: console.append({"type": "error", "text": redact(str(e))}))

    baselines: dict[str, int | None] = {}
    for a in tc.assertions:
        if a.kind == "db_row_count":
            baselines[a.subject] = await hook_count(job, a.subject)

    for i, s in enumerate(tc.steps):
        st = time.monotonic()
        sr = StepResult(i=i, action=s.action, ok=True, t_ms=0)
        try:
            if s.action == "goto":
                url = urljoin(job.target.base_url, s.target or "/")
                if urlparse(url).hostname not in allowed:
                    raise PermissionError(f"target {url} not on allowlist")
                await page.goto(url, wait_until="networkidle")
            elif s.action == "reset":
                sr.ok = await hook_reset(job)
                for k in baselines:
                    baselines[k] = await hook_count(job, k)
            elif s.action == "wait_for":
                await locate(page, s.target).first.wait_for(timeout=8000)
            else:
                loc = locate(page, s.target).first
                if s.action == "click":
                    await loc.click(timeout=8000)
                elif s.action == "dblclick":
                    await loc.dblclick(timeout=8000)
                elif s.action == "fill":
                    await loc.fill(s.value or "", timeout=8000)
                elif s.action == "select":
                    await loc.select_option(s.value or "", timeout=8000)
                elif s.action == "press":
                    await loc.press(s.value or "Enter", timeout=8000)
                await page.wait_for_load_state("networkidle")
        except Exception as e:  # step failure is data
            sr.ok, sr.error = False, f"{type(e).__name__}: {str(e).splitlines()[0][:200]}"
        sr.t_ms = int((time.monotonic() - st) * 1000)
        shot = out / f"{tc.test_case_id}-s{i}.png"
        try:
            await page.screenshot(path=shot, mask=[page.locator("input[type=password]")])
            sr.screenshot = str(shot)
        except Exception:
            pass
        res.steps.append(sr)
        if not sr.ok:
            break

    await page.wait_for_timeout(300)
    steps_ok = all(s.ok for s in res.steps) and len(res.steps) == len(tc.steps)
    for i, a in enumerate(tc.assertions):
        ar = AssertionResult(i=i, evaluated=False, ok=False, expected=a.expected)
        try:
            if not steps_ok:
                ar.message = "not evaluated: a step before it failed"
            else:
                if a.kind == "ui_text":
                    obs = await locate(page, a.subject).first.inner_text(timeout=5000)
                elif a.kind == "count":
                    obs = await locate(page, a.subject).count()
                elif a.kind == "url":
                    obs = page.url
                elif a.kind == "network_posts":
                    obs = sum(1 for n in net if n["method"] == "POST" and n["path"] == a.subject)
                elif a.kind == "status":
                    obs = next((n.get("status") for n in reversed(net) if n["path"] == a.subject), None)
                else:  # db_row_count: change in the hook's count since the case started
                    after, before = await hook_count(job, a.subject), baselines.get(a.subject)
                    obs = None if after is None or before is None else after - before
                if obs is None:
                    ar.message = "no observation"
                else:
                    ar.evaluated, ar.observed, ar.ok = True, obs, compare(obs, a.op, a.expected)
                    ar.message = f"{a.kind} {a.subject}: observed {obs!r}, expected {a.op} {a.expected!r}"
        except Exception as e:
            ar.message = f"not evaluated: {type(e).__name__}"
        res.assertions.append(ar)

    posts: dict[str, list[int]] = {}
    for n in net:
        if n["method"] == "POST":
            posts.setdefault(n["path"], []).append(n["t"])
    for path, ts in posts.items():
        for a, b in zip(ts, ts[1:]):
            if b - a <= DUP_WINDOW_MS:
                res.dup_posts.append(DupPost(url=path, count=len(ts), ms_apart=b - a))
                break

    res.requests = len(net)
    res.console_errors = sum(1 for c in console if c["type"] == "error")
    res.console_warnings = sum(1 for c in console if c["type"] == "warning")
    if not steps_ok or any(not a.evaluated for a in res.assertions):
        res.outcome = "errored"
    elif any(not a.ok for a in res.assertions):
        res.outcome = "failed"
        try:
            await page.screenshot(path=out / f"{tc.test_case_id}-failure.png", full_page=True)
            res.artefacts["screenshot_failure"] = str(out / f"{tc.test_case_id}-failure.png")
        except Exception:
            pass
    (out / f"{tc.test_case_id}-network.json").write_text(json.dumps(net, indent=1))
    (out / f"{tc.test_case_id}-console.json").write_text(json.dumps(console, indent=1))
    res.artefacts["network"] = str(out / f"{tc.test_case_id}-network.json")
    res.artefacts["console"] = str(out / f"{tc.test_case_id}-console.json")
    await ctx.tracing.stop(path=out / f"{tc.test_case_id}-trace.zip")
    res.artefacts["trace"] = str(out / f"{tc.test_case_id}-trace.zip")
    await ctx.close()
    return res


async def run_job(job: RunnerJob) -> RunnerResult:
    out = Path(job.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    result = RunnerResult(job_id=job.job_id, status="completed", started_at=datetime.now(UTC).isoformat())
    try:
        async with async_playwright() as pw:
            browser = await launch(pw, job.browser, headless=job.headless)
            for tc in job.test_cases:
                result.cases.append(await run_case(browser, job, tc, out))
            await browser.close()
    except Exception as e:
        result.status, result.error = "infra_error", f"{type(e).__name__}: {e}"
    result.ended_at = datetime.now(UTC).isoformat()
    return result
