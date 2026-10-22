"""Route sweep (PORTING_PLAN.md §8): load every page at desktop width, report console errors,
horizontal overflow and broken in-app links, and save a screenshot per route.

    npm run build && npx next start -p 3210
    python scripts/sweep_routes.py ./sweep-out          # set CHROME_PATH to use a specific Chromium
"""
import os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "sweep-out"); OUT.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:3210"
ROUTES = ["/", "/runs", "/runs/new", "/runs/live", "/plans", "/regression", "/findings", "/findings/DEF-142", "/findings/DEF-137", "/board",
          "/approvals", "/repair", "/planner", "/projects", "/ui-testing", "/api-testing", "/perf", "/security", "/compat", "/network",
          "/analytics", "/integrations", "/policies", "/settings"]
CHROME = os.environ.get("CHROME_PATH")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
    links, bad = set(), []
    for width, height, tag in [(1440, 900, "d")]:  # desktop only (product decision)
        pg = b.new_page(viewport={"width": width, "height": height})
        errs: list[str] = []
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:160]))
        pg.on("pageerror", lambda e: errs.append(f"pageerror {e}"[:160]))
        for r in ROUTES:
            errs.clear()
            for _ in range(20):
                try: pg.goto(URL + r, wait_until="networkidle"); break
                except Exception: time.sleep(1)
            time.sleep(1.2)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            title = pg.title()
            if tag == "d":
                links |= set(pg.evaluate("Array.from(document.querySelectorAll('a[href^=\"/\"]')).map(a => a.getAttribute('href').split('?')[0])"))
                pg.screenshot(path=OUT / f"{r.strip('/').replace('/', '_') or 'home'}.png")
            ok = not errs and sw <= width
            print(f"{'PASS' if ok else 'FAIL'}  {tag} {r:22} scrollWidth={sw:<5} {title}  {' | '.join(errs)}")
            if not ok: bad.append((tag, r))
        pg.close()
    # every in-app link must resolve to a real page
    pg = b.new_page()
    for href in sorted(links):
        res = pg.goto(URL + href)
        status = res.status if res else 0
        if status >= 400: bad.append(("link", href)); print(f"FAIL  link {href} -> {status}")
    print(f"\n{len(links)} distinct in-app links checked; {len(bad)} problem(s)")
    b.close()
