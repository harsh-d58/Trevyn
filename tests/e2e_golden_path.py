"""Golden path (Part 21, minimum credible prototype): plan → approve → run against the demo shop → B1 confirmed with evidence.
Needs both servers running (see README). Usage: uv run python tests/e2e_golden_path.py [requirement]"""
import json
import sys
import time

import httpx

API = "http://localhost:8000"
req = sys.argv[1] if len(sys.argv) > 1 else "Shoppers can check out their cart and place exactly one order per checkout action."

with httpx.Client(base_url=API, timeout=300) as c:
    project = c.get("/api/projects").json()["items"][0]
    plan = c.post(f"/api/projects/{project['id']}/plans", json={"requirement": req}).json()
    print(f"plan {plan['id'][:8]} · source={plan['source']} · {len(plan['test_cases'])} cases:",
          ", ".join(tc["test_case_id"] for tc in plan["test_cases"]))
    c.post(f"/api/plans/{plan['id']}/approve").raise_for_status()
    run = c.post("/api/runs", json={"plan_id": plan["id"]}, headers={"Idempotency-Key": f"e2e-{time.time()}"}).json()
    print("run", run["id"])
    seq, deadline = 0, time.time() + 600
    while time.time() < deadline:
        for e in c.get(f"/api/runs/{run['id']}/events", params={"after_seq": seq}).json()["items"]:
            seq = e["seq"]
            print(f"  {e['seq']:>3} {e['actor']:<5} {e['event_type']:<10} {e['summary']}")
            if e["event_type"] == "gate" and e["data"].get("approval_id"):  # auto-approve each opened gate, in the test only
                c.post(f"/api/approvals/{e['data']['approval_id']}/decision", json={"approve": True, "reason": "e2e"})
        if c.get(f"/api/runs/{run['id']}").json()["state"] in ("COMPLETED", "FAILED", "CANCELLED", "BLOCKED"):
            break
        time.sleep(1)
    findings = c.get("/api/findings").json()["items"]
    b1 = [f for f in findings if f["runId"] == run["id"] and "order" in f["title"].lower()]
    print(json.dumps(c.get("/api/runs/" + run["id"]).json(), indent=1))
    if not b1:
        sys.exit("FAIL: duplicate-order finding not reported")
    detail = c.get(f"/api/findings/{b1[0]['id']}").json()
    print(f"\n{detail['id']} [{detail['status']}] {detail['title']}\n  actual: {detail['actual']}\n  rule: {detail['verdict_detail']['rule']}"
          f" reproduced {detail['verdict_detail']['reproduced']}\n  evidence: {len(detail['evidence_items'])} items\n"
          f"  hypothesis: {detail['diagnosis']['hypotheses'][0]['statement']}\n\nRepair prompt:\n{detail['repair_prompt']}")
    ok = detail["status"] == "confirmed" and detail["evidence_items"]
    sys.exit(0 if ok else "FAIL: B1 not confirmed with evidence")
