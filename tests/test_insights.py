"""Step 9 insights endpoints, computed from seeded DB rows and a network evidence file."""
import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from trevyn_api.db import (Environment, Evidence, Finding, ModelCall, Plan, PolicyDecision, Project, Repair, Run, RunEvent,
                           Session, init_db)
from trevyn_api.main import app

T0 = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)  # a Monday


@pytest.fixture
async def seeded(tmp_path: Path):
    os.environ.pop("AUTH_MODE", None)
    await init_db()
    net = tmp_path / "T-1-network.json"
    net.write_text(json.dumps([
        {"t": 0, "method": "GET", "path": "/checkout", "url": "http://x/checkout", "status": 200},
        {"t": 100, "method": "POST", "path": "/api/orders", "url": "http://x/api/orders", "status": 201},
        {"t": 280, "method": "POST", "path": "/api/orders", "url": "http://x/api/orders", "status": 201},
        {"t": 5000, "method": "POST", "path": "/api/orders", "url": "http://x/api/orders", "status": 500},
    ]))
    async with Session() as s:
        p = Project(name="Insights", allowed_domains=["localhost"])
        s.add(p)
        await s.flush()
        e = Environment(project_id=p.id, name="demo", base_url="http://localhost:3100")
        s.add(e)
        await s.flush()
        pl = Plan(project_id=p.id, environment_id=e.id, requirement="r", source="template", test_cases=[])
        s.add(pl)
        await s.flush()
        r1 = Run(display_id=f"RUN-I1-{uuid.uuid4().hex[:6]}", project_id=p.id, plan_id=pl.id, environment_id=e.id, name="first", started_at=T0)
        r2 = Run(display_id=f"RUN-I2-{uuid.uuid4().hex[:6]}", project_id=p.id, plan_id=pl.id, environment_id=e.id, name="regr", trigger="regression",
                 started_at=T0 + timedelta(hours=5))
        s.add_all([r1, r2])
        await s.flush()
        s.add_all([
            RunEvent(run_id=r1.id, seq=1, actor="det", event_type="verdict", summary="T-1 → confirmed (rule)", status="failed"),
            RunEvent(run_id=r1.id, seq=2, actor="det", event_type="verdict", summary="T-2 → passed (rule)", status="ok"),
            RunEvent(run_id=r2.id, seq=1, actor="det", event_type="verdict", summary="T-1: baseline failed → rerun passed (fixed)",
                     status="ok"),
            Evidence(run_id=r1.id, test_case_id="T-1", kind="network", uri=str(net), sha256="0" * 64, bytes=1),
            Evidence(run_id=r1.id, test_case_id="T-1", kind="network", uri="s3://bucket/x.json", sha256="0" * 64, bytes=1),
            Evidence(run_id=r1.id, test_case_id="T-1", kind="network", uri=str(tmp_path / "missing.json"), sha256="0" * 64, bytes=1),
        ])
        f1 = Finding(display_id=f"DEF-I1-{uuid.uuid4().hex[:6]}", project_id=p.id, run_id=r1.id, test_case_id="T-1", title="dup order", severity="high",
                     status="confirmed", expected="1", actual="2", created_at=T0)
        f2 = Finding(display_id=f"DEF-I2-{uuid.uuid4().hex[:6]}", project_id=p.id, run_id=r1.id, test_case_id="T-3", title="flaky", severity="low",
                     status="inconclusive", expected="a", actual="b", created_at=T0)
        s.add_all([f1, f2])
        await s.flush()
        s.add_all([
            Repair(display_id=f"REP-I1-{uuid.uuid4().hex[:6]}", project_id=p.id, finding_id=f1.id, kind="diff", prompt="p", outcome="verified",
                   created_at=T0 + timedelta(hours=6)),
            ModelCall(node="planner", provider="anthropic", model="claude-opus-5-5", input_tokens=100, output_tokens=50,
                      latency_ms=10, cost_usd=0.25),
            ModelCall(node="planner", provider="anthropic", model="claude-opus-5-5", input_tokens=100, output_tokens=50,
                      latency_ms=10, cost_usd=0.5),
            PolicyDecision(action="run", subject_id="x", allow=False, policy_version="1"),
        ])
        await s.commit()
        return p.id


async def get(path: str) -> httpx.Response:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.get(path)


async def test_analytics(seeded):
    d = (await get("/api/insights/analytics")).json()
    assert d["flow"]["confirmed"] >= 1 and d["flow"]["verified"] >= 1 and d["flow"]["inconclusive"] >= 1
    assert any(h["weekday"] == 0 and h["hour"] == 10 and h["count"] >= 2 for h in d["heatmap"])
    wk = next(w for w in d["mttr"] if w["week"] == "2026-W43")
    assert wk["mttrHours"] == 6.0
    planner = next(m for m in d["modelCost"] if m["node"] == "planner" and m["model"] == "claude-opus-5-5")
    assert planner["calls"] >= 2 and planner["costUsd"] >= 0.75
    assert d["policyDenials"] >= 1


async def test_network(seeded):
    d = (await get("/api/insights/network")).json()
    orders = next(e for e in d["endpoints"] if e["method"] == "POST" and e["path"] == "/api/orders")
    assert orders["requests"] >= 3 and orders["errors"] >= 1 and orders["duplicatePosts"] >= 1
    assert any(e["path"] == "/checkout" for e in d["endpoints"])


@pytest.mark.parametrize("engine", ["perf", "security", "compat"])
async def test_engines_not_run(engine):
    d = (await get(f"/api/insights/{engine}")).json()
    assert d["available"] is False and "No" in d["reason"]


async def test_project_history(seeded):
    d = (await get(f"/api/projects/{seeded}/history")).json()
    cases = {c["testCaseId"]: c for c in d["cases"]}
    assert [r["outcome"] for r in cases["T-1"]["results"]] == ["failed", "passed"]
    assert cases["T-1"]["latest"] == "passed"
    assert cases["T-2"]["latest"] == "passed"
    assert cases["T-3"]["latest"] == "inconclusive"


async def test_every_insight_follows_one_run(seeded):
    """?run= narrows overview, analytics, network and findings to that run; a run with no findings shows zeros."""
    from sqlalchemy import select
    async with Session() as s:
        r1, r2 = (await s.scalars(select(Run).where(Run.project_id == seeded).order_by(Run.started_at))).all()
    a1 = (await get(f"/api/insights/analytics?run={r1.id}")).json()
    assert a1["flow"]["detected"] == 2 and a1["scope"]["run"] == r1.display_id
    assert (await get(f"/api/insights/analytics?run={r2.display_id}")).json()["flow"]["detected"] == 0
    assert {f["runUuid"] for f in (await get(f"/api/findings?run={r1.id}")).json()["items"]} == {r1.id}
    assert (await get(f"/api/findings?run={r2.id}")).json()["items"] == []
    ov = (await get(f"/api/dashboard/overview?run={r1.id}")).json()
    assert ov["gate"]["release"] == r1.display_id and ov["loop"]["prove"] == [1, 2]
    assert (await get(f"/api/insights/network?run={r2.id}")).json()["files"] == 0
    assert (await get("/api/insights/analytics?run=nope")).status_code == 404
