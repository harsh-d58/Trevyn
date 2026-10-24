"""Manual browser acceptance for two existing runs in different projects.

Example:
  python tests/manual_run_scope_pages.py --web http://localhost:3000 --api http://localhost:8000 \
      --run-a <uuid> --run-b <uuid>
Requires the API, web app and two completed real runs. Does not create or mutate run data.
"""
from __future__ import annotations

import argparse
import asyncio
import json

import httpx
from playwright.async_api import async_playwright

PAGES = ["/", "/runs", "/runs/live", "/plans", "/planner", "/ui-testing", "/api-testing",
         "/perf", "/security", "/compat", "/network", "/analytics", "/board", "/findings",
         "/approvals", "/repair", "/regression", "/projects", "/policies", "/settings", "/integrations"]
DEMO_STRINGS = ["ShopFlow", "CHECKOUT-014 · WebKit", "RUN-04", "Sample data only"]


async def main(args):
    async with httpx.AsyncClient(base_url=args.api, timeout=20) as client:
        a = (await client.get(f"/api/runs/{args.run_a}")).json()
        b = (await client.get(f"/api/runs/{args.run_b}")).json()
        assert a["project_id"] != b["project_id"], "Use runs from different projects"
        projects = {p["id"]: p["name"] for p in (await client.get("/api/projects")).json()["items"]}

    report = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for run in (a, b):
            await page.goto(args.web.rstrip("/") + "/runs", wait_until="domcontentloaded")
            await page.get_by_role("button", name="Choose project").click()
            await page.get_by_role("menuitem").filter(has_text=projects[run["project_id"]]).first.click()
            await page.get_by_role("button", name="Choose the run every page shows").click()
            await page.get_by_role("menuitem").filter(has_text=run["id"]).first.click()
            await page.wait_for_timeout(500)
            pages = {}
            for path in PAGES:
                await page.goto(args.web.rstrip("/") + path, wait_until="domcontentloaded")
                await page.get_by_role("button", name="Choose the run every page shows").wait_for()
                text = await page.locator("body").inner_text()
                assert run["id"] in text, f"{path} did not display selected run {run['id']}"
                for marker in DEMO_STRINGS:
                    assert marker not in text, f"{path} displayed demo string {marker}"
                pages[path] = {"run": run["id"], "characters": len(text)}
            report[run["uuid"]] = pages
        assert not errors, f"Browser errors: {errors}"
        await browser.close()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--web", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--run-a", required=True)
    parser.add_argument("--run-b", required=True)
    asyncio.run(main(parser.parse_args()))
