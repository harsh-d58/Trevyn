"""Repair loop end to end: baseline run finds DEF-142 → propose patch → approve → regression run → verified.
Needs the demo shop (:3100) and the API (:8000) running. Restores every planted bug at the end.
Usage: uv run python tests/e2e_repair_loop.py"""
import sys
import time

import httpx

API, SHOP = "http://localhost:8000", "http://localhost:3100"
REQ = "Shoppers can check out their cart and place exactly one order per checkout action."


def wait(c, run_id, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        r = c.get(f"/api/runs/{run_id}").json()
        if r["state"] in ("COMPLETED", "FAILED", "CANCELLED", "BLOCKED"):
            return r
        if r["state"] == "AWAITING_APPROVAL":  # AI plans mark checkout cases high-risk; approve them, in the test only
            for a in c.get("/api/approvals", params={"run": run_id}).json()["items"]:
                c.post(f"/api/approvals/{a['id']}/decision", json={"approve": True, "reason": "e2e"})
        time.sleep(1)
    sys.exit(f"FAIL: {run_id} did not finish")


with httpx.Client(base_url=API, timeout=120) as c, httpx.Client(timeout=20) as shop:
    shop.post(f"{SHOP}/__trevyn/bugs", json={"bugs": "all"}).raise_for_status()
    shop.post(f"{SHOP}/__trevyn/reset").raise_for_status()
    project = c.get("/api/projects").json()["items"][0]
    plan = c.post(f"/api/projects/{project['id']}/plans", json={"requirement": REQ}).json()
    c.post(f"/api/plans/{plan['id']}/approve").raise_for_status()
    base = c.post("/api/runs", json={"plan_id": plan["id"]}, headers={"Idempotency-Key": f"rl-{time.time()}"}).json()
    wait(c, base["id"])
    finding = next((f for f in c.get("/api/findings").json()["items"] if f["runId"] == base["id"] and "order" in f["title"].lower()), None)
    if not finding:
        sys.exit("FAIL: baseline run did not find the duplicate order bug")
    print(f"baseline {base['id']}: {finding['id']} {finding['verdict']}")

    rp = c.post(f"/api/findings/{finding['id']}/repair-proposals")
    rp.raise_for_status()
    rp = rp.json()
    print(f"proposed {rp['id']} attempt {rp['attempt']} guard flags={len(rp['guard']['flags'])} approval={rp['approval']['id']}")
    assert c.post(f"/api/findings/{finding['id']}/repair-proposals").status_code == 409, "second proposal must be refused while one is open"
    assert c.get(f"/api/findings/{finding['id']}").json()["column"] == "approval"

    c.post(f"/api/repairs/{rp['id']}/verify").raise_for_status()
    end = time.time() + 300
    while time.time() < end:
        rp = c.get(f"/api/repairs/{rp['id']}").json()
        if rp["outcome"] in ("verified", "failed", "escalated", "rejected"):
            break
        time.sleep(1)
    print(f"regression {rp['regression_run']}: outcome={rp['outcome']} counts={rp['counts']}")
    for row in rp["comparison"]:
        print(f"  {row['test_case_id']}: {row['baseline']} -> {row['rerun']} ({row['change']})")

    baseline_after = c.get(f"/api/runs/{base['id']}").json()
    cmp_ = c.get(f"/api/runs/{rp['regression_run']}/comparison").json()
    manifest = c.get(f"/api/runs/{rp['regression_run']}/manifest").json()
    verified = c.post(f"/api/runs/{rp['regression_run']}/manifest/verify", json=manifest).json()
    print("comparison items:", len(cmp_["items"]), "| manifest integrity:", verified["integrity_verified"])

    shop.post(f"{SHOP}/__trevyn/bugs", json={"bugs": "all"})  # restore every planted bug for the next demo
    checks = {"outcome verified": rp["outcome"] == "verified", "original fixed": any(r["change"] == "fixed" for r in rp["comparison"]),
              "finding moved to verified": c.get(f"/api/findings/{finding['id']}").json()["column"] == "verified",
              "baseline run untouched": baseline_after["state"] == "COMPLETED" and baseline_after["counts"] == c.get(f"/api/runs/{base['id']}").json()["counts"],
              "manifest verifies": verified["integrity_verified"]}
    for k, v in checks.items():
        print(("PASS " if v else "FAIL ") + k)
    sys.exit(0 if all(checks.values()) else 1)
