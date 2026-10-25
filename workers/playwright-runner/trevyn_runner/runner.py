"""Playwright step interpreter (Part 9.1). Interprets the whitelisted Step vocabulary; never runs model-written code.
Exit/`status` is infra-level only: failed assertions are data, not errors."""
from __future__ import annotations

import json
import platform
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError, async_playwright

from trevyn_contracts import (AssertionResult, CaseResult, DupPost, RunnerJob, RunnerResult, StepResult, TestCase)
from .browser import launch

SECRET_RE = re.compile(r"(eyJ[\w-]+\.[\w-]+\.[\w-]+|Bearer\s+\S+|(?i:password|token|secret)=[^&\s]+)")
DUP_WINDOW_MS = 2000


def redact(text: str) -> str:
    return SECRET_RE.sub("[REDACTED]", text)


def sanitize_har(path: Path) -> None:
    """Keep HAR timings/statuses while stripping credentials and request/response bodies."""
    data = json.loads(path.read_text(encoding="utf-8"))
    for entry in data.get("log", {}).get("entries", []):
        for side in (entry.get("request", {}), entry.get("response", {})):
            side["cookies"] = []
            side.pop("postData", None)
            if "content" in side:
                content = side["content"]
                side["content"] = {"size": content.get("size", 0), "mimeType": content.get("mimeType", "")}
            # Headers can carry arbitrary application secrets; HAR links only need timing metadata.
            side["headers"] = []
            side["headersSize"] = -1
            if isinstance(side.get("url"), str):
                u = urlparse(side["url"])
                side["url"] = u._replace(query="", fragment="").geturl()
        entry.get("request", {})["queryString"] = []
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def on_response(net: list[dict], r, t_ms: int | None = None) -> None:
    """Records the status (and time to response, `ms`) on the matching request, and where a redirect points so
    status checks can follow it."""
    for n in reversed(net):
        if n["url"] == redact(r.url) and "status" not in n:
            n["status"] = r.status
            size = r.headers.get("content-length")
            n["responseBytes"] = int(size) if size and size.isdigit() else None
            if t_ms is not None:
                n["ms"] = max(0, t_ms - n["t"])
            if 300 <= r.status < 400 and (loc := r.headers.get("location")):
                n["location"] = redact(urljoin(r.url, loc))
            return


def final_status(net: list[dict], path: str) -> int | None:
    """Status of the latest request for `path`, judged where its redirects land (/dist -> 301 -> /dist/ -> 200)."""
    i = next((i for i in range(len(net) - 1, -1, -1) if net[i]["path"] == path), None)
    for _ in range(5):
        loc = net[i].get("location") if i is not None else None
        nxt = next((j for j in range(i + 1, len(net)) if net[j]["url"] == loc), None) if loc else None
        if nxt is None:
            break
        i = nxt
    return net[i].get("status") if i is not None else None


def locate(page: Page, target: str):
    kind, _, rest = target.partition("=")
    unquote = lambda v: v.strip().strip("'\"")  # noqa: E731 - planners write name='Active' as often as name=Active
    if kind == "role":
        m = re.match(r"(\w+)(?:\[name=(.+)\])?$", rest)
        role, name = (m.group(1), unquote(m.group(2)) if m.group(2) else None) if m else (rest, None)
        return page.get_by_role(role, name=name, exact=False) if name else page.get_by_role(role)
    if kind in ("label", "text", "testid"):
        rest = unquote(rest)
    # label= also matches a field's placeholder: many inputs (TodoMVC's "What needs to be done?") have no <label>
    return {"label": lambda: page.get_by_label(rest).or_(page.get_by_placeholder(rest)), "testid": lambda: page.get_by_test_id(rest),
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


async def settle(page: Page) -> None:
    """A live page may poll forever; network idle is a best-effort pause, not a pass condition."""
    try:
        await page.wait_for_load_state("networkidle", timeout=5000)
    except PlaywrightTimeoutError:
        pass


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


async def run_case(browser, job: RunnerJob, tc: TestCase, out: Path, device: dict | None = None) -> CaseResult:
    allowed = set(job.target.allowed_hosts)
    res = CaseResult(test_case_id=tc.test_case_id, outcome="passed")
    net: list[dict] = []
    console: list[dict] = []
    har = out / f"{tc.test_case_id}-network.har"
    viewport = job.viewport or (device or {}).get("viewport") or {"width": 1280, "height": 800}
    context_options = {"viewport": viewport, "record_har_path": str(har), "record_har_content": "omit"}
    if job.mobile:
        context_options.update(is_mobile=True, has_touch=True,
                               device_scale_factor=(device or {}).get("device_scale_factor", 3),
                               user_agent=(device or {}).get("user_agent"))
    ctx = await browser.new_context(**context_options)
    if job.browser == "chromium":
        vitals_script = (Path(__file__).parent / "vendor" / "web-vitals.iife.js").read_text(encoding="utf-8")
        vitals_script += """\nwindow.__trevynVitals = {};
          for (const name of ['LCP','CLS','INP','TTFB']) {
            const observe = webVitals?.['on' + name];
            if (observe) observe(metric => { window.__trevynVitals[name] =
              {name, value: metric.value, rating: metric.rating}; }, {reportAllChanges: true});
          }
        """
        await ctx.add_init_script(script=vitals_script)

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
                                             "resourceType": r.resource_type,
                                             "path": urlparse(r.url).path, "url": redact(r.url)}))
    page.on("response", lambda r: on_response(net, r, int((time.monotonic() - t0) * 1000)))
    page.on("requestfailed", lambda r: setattr(res, "failed_requests", res.failed_requests + 1))
    page.on("console", lambda m: console.append({"type": m.type, "text": redact(m.text)}))
    page.on("pageerror", lambda e: console.append({"type": "error", "text": redact(str(e))}))

    baselines: dict[str, int | None] = {}
    axe_reports: list[dict] = []
    vitals_reports: list[dict] = []
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
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await settle(page)
                if job.browser == "chromium":
                    try:
                        metrics = await page.evaluate("window.__trevynVitals || {}")
                        vitals_reports.append({"path": urlparse(url).path or "/", "metrics": metrics})
                    except Exception:
                        vitals_reports.append({"path": urlparse(url).path or "/", "not_run": "capture unavailable"})
                    try:
                        await page.add_script_tag(path=str(Path(__file__).parent / "vendor" / "axe.min.js"))
                        violations = await page.evaluate("""async () => {
                          const result = await window.axe.run(document, {runOnly: {type: 'tag',
                            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}});
                          return result.violations.map(v => ({id: v.id, impact: v.impact, help: v.help,
                            helpUrl: v.helpUrl, tags: v.tags, nodes: v.nodes.length}));
                        }""")
                        axe_reports.append({"path": urlparse(url).path or "/", "violations": violations})
                    except Exception as exc:
                        axe_reports.append({"path": urlparse(url).path or "/", "not_run": type(exc).__name__})
                try:
                    sr.navigation = await page.evaluate("""() => {
                      const n = performance.getEntriesByType('navigation')[0];
                      return n ? {domContentLoadedMs: Math.round(n.domContentLoadedEventEnd),
                        loadMs: Math.round(n.loadEventEnd), responseStartMs: Math.round(n.responseStart),
                        transferBytes: n.transferSize || null} : null;
                    }""")
                except Exception:
                    pass  # a missing performance entry must not turn a successful navigation into a failed test
            elif s.action == "reset":
                sr.ok = await hook_reset(job)
                for k in baselines:
                    baselines[k] = await hook_count(job, k)
            elif s.action == "wait_for":
                await locate(page, s.target).first.wait_for(timeout=8000)
            else:
                loc = locate(page, s.target).first
                if s.action in ("click", "dblclick") and await loc.count() and await loc.is_disabled():
                    # a repeat click on a control the app disabled (e.g. "Place order" after the first click) is ignored
                    # by the browser for a real user too; it is not a test error
                    sr.error = None
                elif s.action == "click":
                    await loc.click(timeout=8000)
                elif s.action == "dblclick":
                    await loc.dblclick(timeout=8000)
                elif s.action == "fill":
                    await loc.fill(s.value or "", timeout=8000)
                elif s.action == "select":
                    await loc.select_option(s.value or "", timeout=8000)
                elif s.action == "press":
                    await loc.press(s.value or "Enter", timeout=8000)
                await settle(page)
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
                    locator = locate(page, a.subject).first
                    # Site-map headings came from DOM textContent. Reading innerText here
                    # can add line breaks and CSS text-transform, creating a false failure.
                    obs = (await locator.text_content(timeout=5000) if tc.requirement_ref == "SITEMAP"
                           else await locator.inner_text(timeout=5000))
                elif a.kind == "count":
                    obs = await locate(page, a.subject).count()
                elif a.kind == "url":
                    obs = page.url
                elif a.kind == "network_posts":
                    obs = sum(1 for n in net if n["method"] == "POST" and n["path"] == a.subject)
                elif a.kind == "status":
                    obs = final_status(net, a.subject)
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
    if axe_reports:
        axe_path = out / f"{tc.test_case_id}-axe.json"
        axe_path.write_text(json.dumps(axe_reports, separators=(",", ":")), encoding="utf-8")
        res.artefacts["axe"] = str(axe_path)
    if vitals_reports:
        try:
            vitals_reports[-1]["metrics"] = await page.evaluate("window.__trevynVitals || {}")
        except Exception:
            pass
        vitals_path = out / f"{tc.test_case_id}-vitals.json"
        vitals_path.write_text(json.dumps(vitals_reports, separators=(",", ":")), encoding="utf-8")
        res.artefacts["web_vitals"] = str(vitals_path)
    await ctx.tracing.stop(path=out / f"{tc.test_case_id}-trace.zip")
    res.artefacts["trace"] = str(out / f"{tc.test_case_id}-trace.zip")
    await ctx.close()
    if har.is_file():
        try:
            sanitize_har(har)
            res.artefacts["har"] = str(har)
        except (OSError, ValueError, TypeError):
            har.unlink(missing_ok=True)  # never publish an unsanitized HAR
    return res


async def run_job(job: RunnerJob) -> RunnerResult:
    out = Path(job.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    result = RunnerResult(job_id=job.job_id, status="completed", started_at=datetime.now(UTC).isoformat())
    try:
        async with async_playwright() as pw:
            browser = await launch(pw, job.browser, headless=job.headless)
            device = pw.devices.get("iPhone 13") if job.mobile else None
            result.environment = {"browser": job.browser, "version": browser.version,
                                  "os": platform.system(), "os_version": platform.release(),
                                  "viewport": job.viewport or (device or {}).get("viewport") or {"width": 1280, "height": 800}}
            for tc in job.test_cases:
                result.cases.append(await run_case(browser, job, tc, out, device))
            await browser.close()
    except Exception as e:
        result.status, result.error = "infra_error", f"{type(e).__name__}: {e}"
    result.ended_at = datetime.now(UTC).isoformat()
    return result
