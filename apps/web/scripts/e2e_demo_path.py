"""Phase 1 demo-path check (PORTING_PLAN.md §8): drives the project-context §23 story through in-app
navigation, so the in-memory live store survives between pages.

    npm run build && npx next start -p 3210
    python scripts/e2e_demo_path.py ./e2e-out            # set CHROME_PATH to use a specific Chromium

Note: in Playwright's sync API page.url only refreshes during Playwright calls; read location.pathname.
"""
import os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:3210"
CHROME = os.environ.get("CHROME_PATH")  # None = Playwright's bundled Chromium
errors, results = [], []

def check(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name, detail))

def go(pg, query):
    """client-side navigation through the command palette"""
    pg.keyboard.press("Control+k"); time.sleep(0.35)
    pg.keyboard.type(query); time.sleep(0.35)
    pg.keyboard.press("Enter"); time.sleep(1.3)

def path(pg):
    # page.url is only refreshed while Playwright processes events; read the live location instead
    return pg.evaluate("location.pathname")

def toast_text(pg):
    return " | ".join(t.inner_text() for t in pg.locator("[data-sonner-toast]").all())

def drag(pg, src, dst):
    dst.scroll_into_view_if_needed(); src.scroll_into_view_if_needed(); time.sleep(0.3)
    a, b = src.bounding_box(), dst.bounding_box()
    pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + 20); pg.mouse.down()
    for i in range(1, 16):
        pg.mouse.move(a["x"] + a["width"] / 2 + (b["x"] + b["width"] / 2 - a["x"] - a["width"] / 2) * i / 15, a["y"] + 20 + (b["y"] + 80 - a["y"] - 20) * i / 15); time.sleep(0.02)
    time.sleep(0.15); pg.mouse.up(); time.sleep(0.7)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    for _ in range(30):
        try: pg.goto(URL + "/", wait_until="networkidle"); break
        except Exception: time.sleep(1)
    time.sleep(1.5)

    # 1 · New run wizard: prod is blocked, staging launches
    go(pg, "New test run")
    check("wizard renders", pg.get_by_text("Create test run").count() > 0)
    for _ in range(4): pg.get_by_role("button", name="Continue").click(); time.sleep(0.3)
    pg.screenshot(path=OUT / "01-wizard-safety.png")
    pg.get_by_role("button", name="Application").click(); time.sleep(0.4)
    pg.locator("[data-slot=select-trigger]").first.click(); time.sleep(0.4)
    pg.get_by_role("option", name="Production (blocked by policy)").click(); time.sleep(0.4)
    pg.get_by_role("button", name="Safety & execution").click(); time.sleep(0.4)
    pg.get_by_role("button", name="Launch run").click(); time.sleep(0.8)
    check("prod launch blocked", path(pg) == "/runs/new" and "production" in toast_text(pg).lower(), toast_text(pg)[:90])
    pg.get_by_role("button", name="Application").click(); time.sleep(0.4)
    pg.locator("[data-slot=select-trigger]").first.click(); time.sleep(0.4)
    pg.get_by_role("option", name="Staging · DEMO").click(); time.sleep(0.4)
    pg.get_by_role("button", name="Safety & execution").click(); time.sleep(0.4)
    pg.get_by_role("button", name="Launch run").click(); time.sleep(1.5)
    check("staging launch → live run", path(pg) == "/runs/live", path(pg))

    # 2 · Live run pauses at the gate, approve, continues
    gate = pg.get_by_role("button", name="Approve and continue")
    gate.wait_for(timeout=15000)
    pg.screenshot(path=OUT / "02-live-gate.png")
    check("gate pauses run", pg.get_by_text("Waiting for approval").count() > 0)
    gate.click(); time.sleep(4)
    check("gate approved, run continues", pg.get_by_text("Approved by Alex Chen").count() > 0 and pg.get_by_text("Running").count() > 0)
    pg.screenshot(path=OUT / "03-live-running.png")

    # 3 · Findings list + DEF-142 detail: evidence tabs and challenge
    go(pg, "Findings")
    check("findings list", pg.get_by_text("Evidence-backed bug reports").count() > 0)
    pg.screenshot(path=OUT / "04-findings.png")
    go(pg, "DEF-142")
    pg.get_by_role("tab", name="Network").click(); time.sleep(0.6)
    check("network evidence tab", pg.get_by_text("duplicate retry").count() > 0)
    pg.screenshot(path=OUT / "05-finding-network.png")
    pg.get_by_role("button", name="Challenge finding").click(); time.sleep(0.5)
    pg.screenshot(path=OUT / "06-challenge.png")
    pg.get_by_role("button", name="Submit challenge").click(); time.sleep(2.2)
    check("challenge upheld", pg.get_by_text("Finding upheld").count() > 0)

    # 4 · Board: policy refusal, then a legal move
    go(pg, "Findings board")
    cols = pg.locator("div.glass-1.flex.min-h-\\[460px\\]")
    drag(pg, pg.get_by_label("DEF-142 Duplicate orders after checkout. Space to move, Enter to open."), cols.nth(5))
    check("verified blocked by policy", "Blocked by policy" in toast_text(pg), toast_text(pg)[:90])
    pg.screenshot(path=OUT / "07-board-refused.png")
    time.sleep(3.5)
    drag(pg, pg.get_by_label("DEF-136 Order history paginates past the last page. Space to move, Enter to open."), cols.nth(5))
    check("regression → verified allowed", "DEF-136 moved to Verified" in toast_text(pg), toast_text(pg)[:90])

    # 5 · Repair: approve patch → regression passes → DEF-142 to Regression rerun
    go(pg, "Repair assistant")
    pg.get_by_role("button", name="Approve patch & rerun regression").click(); time.sleep(3.2)
    check("repair done", pg.get_by_text("The retry now replays the first order").count() > 0)
    pg.screenshot(path=OUT / "08-repair-done.png", full_page=True)

    # 6 · Regression + Approvals reflect it
    go(pg, "Regression suite")
    check("regression shows fix", pg.get_by_text("CHECKOUT-014 passes on the patched build").count() > 0)
    go(pg, "Approvals")
    pg.get_by_role("heading", name="Approvals").wait_for()
    # Next 16 keeps visited pages mounted but hidden (React <Activity>), so only count visible matches
    check("AP-31 resolved", not any(el.is_visible() for el in pg.locator("main").get_by_text("AP-31").all()))
    pg.get_by_role("button", name="Approve").first.click(); time.sleep(0.8)
    pg.screenshot(path=OUT / "09-approvals.png")

    # 7 · Board shows DEF-142 moved by the repair
    go(pg, "Findings board")
    check("DEF-142 in Regression rerun column", cols.nth(4).get_by_text("DEF-142").count() > 0)
    go(pg, "Test runs")
    check("ledger lists launched run", pg.get_by_text("RUN-0414").count() > 0)
    pg.screenshot(path=OUT / "10-runs.png", full_page=True)

    b.close()

for r in results: print(*r, sep="  ")
print("\nconsole errors:\n" + ("\n".join(errors) or "none"))
