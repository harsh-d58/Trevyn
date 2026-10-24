"""Test any URL you own or are allowed to test: creates (or reuses) a project, plans from your requirement, runs it.
Needs the API on :8000. Usage:
  uv run python tests/try_url.py https://your-site.example "Users can sign up, log in and see their dashboard"
Use a site you own or are allowed to test. Do not put passwords in the requirement text."""
import sys
import time
import uuid

import httpx

API = "http://localhost:8000"
if len(sys.argv) < 3:
    sys.exit(__doc__)
url, requirement = sys.argv[1].rstrip("/"), sys.argv[2]

with httpx.Client(base_url=API, timeout=300) as c:
    ready = c.get("/readyz").json()
    if not ready.get("ai"):
        print("WARNING: no AI key, so unfamiliar sites receive two smoke tests after discovery.")
    project = next((p for p in c.get("/api/projects").json()["items"] if any(e["base_url"].rstrip("/") == url for e in p["environments"])), None)
    if not project:
        r = c.post("/api/projects", json={"name": url.split("//")[-1], "base_url": url, "authorised": True})
        if r.status_code >= 400:
            sys.exit(f"Project refused: {r.json().get('detail', r.text)}")
        project = r.json()
    print("project", project["name"])
    plan = c.post(f"/api/projects/{project['id']}/plans", json={"requirement": requirement}).json()
    print(f"plan: {len(plan['test_cases'])} cases ({plan['source']}):", ", ".join(tc["title"] for tc in plan["test_cases"]))
    c.post(f"/api/plans/{plan['id']}/approve").raise_for_status()
    r = c.post("/api/runs", json={"plan_id": plan["id"]}, headers={"Idempotency-Key": str(uuid.uuid4())})
    if r.status_code >= 400:
        sys.exit(f"Run refused: {r.json().get('detail', r.text)}")
    run = r.json()
    print(f"run {run['id']} · watch: http://localhost:3000/runs/live?run={run['id']}")
    seq = 0
    while True:
        for e in c.get(f"/api/runs/{run['id']}/events", params={"after_seq": seq}).json()["items"]:
            seq = e["seq"]
            print(f"  {e['actor']:<5} {e['event_type']:<10} {e['summary'][:150]}")
            if e["event_type"] == "gate":
                print("  → approve this gate in the dashboard (Approvals or the live run page)")
        if c.get(f"/api/runs/{run['id']}").json()["state"] in ("COMPLETED", "FAILED", "CANCELLED", "BLOCKED"):
            break
        time.sleep(1)
    found = [f for f in c.get("/api/findings").json()["items"] if f["runId"] == run["id"]]
    print(f"\n{len(found)} findings:" if found else "\nNo findings: every test passed or none could run.")
    for f in found:
        print(f"  {f['id']} [{f['status']}] {f['title']} → http://localhost:3000/findings/{f['id']}")
