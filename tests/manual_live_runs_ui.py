"""Read-only browser check against running API (:8000) and Next (:3000) servers.

Run from the repository root:
    .venv/Scripts/python.exe tests/manual_live_runs_ui.py
Requires at least two existing runs; does not start or modify a run.
"""
from __future__ import annotations

import asyncio
import re

import httpx
from playwright.async_api import async_playwright


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get("http://localhost:8000/api/runs?limit=10")
        response.raise_for_status()
        runs = response.json()["items"]
        if len(runs) < 2:
            raise RuntimeError("Start two runs before checking the browser tab")
        first, second = runs[:2]
        first_events = (await client.get(f"http://localhost:8000/api/runs/{first['uuid']}/events")).json()["items"]
        second_events = (await client.get(f"http://localhost:8000/api/runs/{second['uuid']}/events")).json()["items"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            page = await browser.new_page()
            await page.goto("http://localhost:3000/runs/live")
            for run, events in ((first, first_events), (second, second_events)):
                link = page.locator(f'a[href="/runs/live?run={run["uuid"]}"]')
                await link.wait_for(timeout=20000)
                await link.click()
                await page.wait_for_url(f"**/runs/live?run={run['uuid']}", timeout=20000)
                await page.get_by_role("heading", name=re.compile(re.escape(run["name"]))).wait_for(timeout=20000)
                if events:
                    await page.get_by_text(events[0]["summary"], exact=True).wait_for(timeout=20000)
                other = second_events if run is first else first_events
                unique = next((e["summary"] for e in other if e["summary"] not in {x["summary"] for x in events}), None)
                if unique:
                    assert await page.get_by_text(unique, exact=True).count() == 0
            print(f"Live Runs UI: selected {first['uuid'][:8]} and {second['uuid'][:8]}; logs stayed isolated")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
