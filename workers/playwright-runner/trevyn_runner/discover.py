"""Read-only, bounded browser survey for URL-mode planning."""
from __future__ import annotations

import asyncio
import re
import time
from collections import deque
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

from playwright.async_api import async_playwright
from trevyn_contracts import PageMap, SiteMap

from .browser import launch


def path_of(url: str) -> str:
    parts = urlsplit(url)
    # Query strings commonly carry session or reset tokens; never store or show them to the planner.
    return parts.path or "/"


def crawl_url(base: str, href: str) -> str | None:
    """Keep same-site HTTP(S) URLs, allowing an HTTP-to-HTTPS upgrade."""
    target = urlsplit(urljoin(base, href))
    start = urlsplit(base)
    scheme_ok = target.scheme == start.scheme or (start.scheme == "http" and target.scheme == "https")
    if not scheme_ok or (target.hostname, target.port) != (start.hostname, start.port):
        return None
    if target.scheme not in ("http", "https") or target.username or target.password:
        return None
    return urlunsplit((target.scheme, target.netloc, target.path or "/", target.query, ""))


async def discover(base_url: str, allowed_hosts: list[str], *, max_pages: int = 10,
                   max_depth: int = 2, timeout_s: int = 60) -> SiteMap:
    start = crawl_url(base_url, base_url)
    if not start or urlsplit(start).hostname not in allowed_hosts:
        raise ValueError("start URL is outside the project's allowlist")
    parts = urlsplit(start)
    public_start = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    result = SiteMap(start_url=public_start, crawled_at=datetime.now(UTC).isoformat())
    queue = deque([(start, 0)])
    seen: set[str] = set()
    deadline = time.monotonic() + timeout_s
    last_visit = 0.0
    async with async_playwright() as pw:
        browser = await launch(pw)
        context = await browser.new_context()

        async def guard(route):
            request = route.request
            target = crawl_url(start, request.url)
            if target and request.method in ("GET", "HEAD"):
                await route.continue_()
            else:
                await route.abort()

        await context.route("**/*", guard)
        page = await context.new_page()
        try:
            while queue and len(result.pages) < max_pages and time.monotonic() < deadline:
                url, depth = queue.popleft()
                if path_of(url) in seen:
                    continue
                seen.add(path_of(url))
                delay = 0.5 - (time.monotonic() - last_visit)
                if delay > 0:
                    await asyncio.sleep(delay)
                last_visit = time.monotonic()
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=min(10000, max(1000, int((deadline - time.monotonic()) * 1000))))
                    await page.wait_for_timeout(200)
                    actual = crawl_url(start, page.url)
                    if not actual:
                        raise ValueError("page redirected outside the allowed origin")
                    data = await page.evaluate("""() => {
                      const clean = s => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 160);
                      // hidden controls appear only after an action (e.g. "Clear completed"); plans must not expect them up front
                      const shown = el => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
                      const label = el => clean(el.getAttribute('aria-label') ||
                        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) ||
                        el.closest('label')?.textContent || el.getAttribute('placeholder') || el.name || '');
                      return {
                        title: clean(document.title),
                        headings: [...document.querySelectorAll('h1,h2,h3')].map(e => clean(e.textContent)).filter(Boolean).slice(0, 30),
                        links: [...document.querySelectorAll('a[href]')].map(e => ({text: clean(e.textContent || e.getAttribute('aria-label')), href: e.href})).slice(0, 100),
                        buttons: [...document.querySelectorAll('button,input[type=button],input[type=submit]')].filter(shown)
                          .map(e => clean(e.getAttribute('aria-label') || e.textContent || e.value)).filter(Boolean).slice(0, 60),
                        hiddenButtons: [...document.querySelectorAll('button,input[type=button],input[type=submit]')].filter(e => !shown(e))
                          .map(e => clean(e.getAttribute('aria-label') || e.textContent || e.value)).filter(Boolean).slice(0, 30),
                        fields: [...document.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden')
                          .map(e => ({label: label(e), type: e.type || e.tagName.toLowerCase(), required: e.required, visible: shown(e)})).slice(0, 60),
                        passwordFields: document.querySelectorAll('input[type=password]').length,
                      };
                    }""")
                    links = []
                    for link in data["links"]:
                        target = crawl_url(start, link["href"])
                        if target:
                            links.append({"text": link["text"], "path": path_of(target)})
                            if depth < max_depth and path_of(target) not in seen and path_of(target) not in (path_of(u) for u, _ in queue):
                                queue.append((target, depth + 1))
                    try:
                        aria = (await page.locator("body").aria_snapshot(timeout=3000))[:4096]
                    except Exception:  # noqa: BLE001 — accessibility snapshots are optional browser evidence
                        aria = ""
                    # Accessibility output can expose current field values; redact form values entirely.
                    aria = re.sub(r'(?im)^(.*(?:textbox|password|searchbox|combobox).*):\s*.+$', r'\1', aria)
                    result.pages.append(PageMap(path=path_of(actual), title=data["title"], headings=data["headings"],
                                                links=links[:60], buttons=data["buttons"], hidden_buttons=data["hiddenButtons"], fields=data["fields"],
                                                has_login_form=bool(data["passwordFields"]), aria_snapshot=aria))
                except Exception as exc:  # noqa: BLE001 — one inaccessible page must not abort the bounded scan
                    result.errors.append(f"{path_of(url)}: {type(exc).__name__}")
            result.truncated = bool(queue) or time.monotonic() >= deadline
        finally:
            await context.close()
            await browser.close()
    return result
