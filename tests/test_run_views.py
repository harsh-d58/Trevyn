"""Run projections must never mix two projects or runs."""
import json
import os
import uuid

import httpx
import pytest

from trevyn_api.db import Environment, Evidence, Finding, Plan, Project, Run, RunEvent, Session, init_db
from trevyn_api.main import app


async def get(path: str):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


async def test_run_views_isolate_data(tmp_path):
    os.environ.pop("AUTH_MODE", None)
    await init_db()
    ids = []
    async with Session() as s:
        for i in range(2):
            p = Project(name=f"scope-{i}", allowed_domains=["example.test"])
            s.add(p)
            await s.flush()
            env = Environment(project_id=p.id, name="staging", base_url="https://example.test")
            s.add(env)
            await s.flush()
            cid = f"CASE-{i}"
            plan = Plan(project_id=p.id, environment_id=env.id, requirement=f"requirement-{i}", source="template",
                        test_cases=[{"test_case_id": cid, "title": f"case-{i}", "steps": [{"action": "goto", "target": f"/{i}"}]}])
            s.add(plan)
            await s.flush()
            run = Run(display_id=f"RUN-SCOPE-{uuid.uuid4().hex[:8]}", project_id=p.id, plan_id=plan.id,
                      environment_id=env.id, name=f"run-{i}")
            s.add(run)
            await s.flush()
            net = tmp_path / f"network-{i}.json"
            net.write_text(json.dumps([{"t": 0, "url": "https://example.test/api/" + cid,
                                        "path": "/api/" + cid, "method": "GET", "resourceType": "fetch",
                                        "status": 200, "ms": 10 + i}]))
            passive = tmp_path / f"passive-{i}.json"
            passive.write_text(json.dumps({"rules": {"P1": "passed" if i == 0 else "failed"}, "pages": [f"https://example.test/{i}"]}))
            lighthouse = tmp_path / f"lighthouse-{i}.json"
            lighthouse.write_text(json.dumps({"page": f"https://example.test/{i}", "score": 80 + i,
                                              "metrics": {"LCP": {"value": 2000 + i, "status": "passed"}},
                                              "opportunities": []}))
            vitals = tmp_path / f"vitals-{i}.json"
            vitals.write_text(json.dumps([{"path": f"/{i}", "metrics": {"LCP": {"value": 2000 + i}}}]))
            compat = tmp_path / f"compat-{i}.json"
            compat.write_text(json.dumps({"rows": [{"case": cid, "browser": "firefox",
                                                     "status": "passed" if i == 0 else "failed"}]}))
            axe = tmp_path / f"axe-{i}.json"
            axe.write_text(json.dumps([{"path": f"/{i}", "violations": [{"id": f"rule-{i}",
                                  "impact": "serious", "help": f"rule-{i}", "nodes": 1}]}]))
            s.add_all([Evidence(run_id=run.id, test_case_id=cid, kind="network", uri=str(net), sha256="0" * 64, bytes=1),
                       Evidence(run_id=run.id, test_case_id="PASSIVE-SUMMARY", kind="passive_summary", uri=str(passive), sha256="0" * 64, bytes=1),
                       Evidence(run_id=run.id, test_case_id=cid, kind="lighthouse_summary", uri=str(lighthouse), sha256="0" * 64, bytes=1),
                       Evidence(run_id=run.id, test_case_id=cid, kind="web_vitals", uri=str(vitals), sha256="0" * 64, bytes=1),
                       Evidence(run_id=run.id, test_case_id=cid, kind="compat_matrix", uri=str(compat), sha256="0" * 64, bytes=1),
                       Evidence(run_id=run.id, test_case_id=cid, kind="axe", uri=str(axe), sha256="0" * 64, bytes=1),
                       RunEvent(run_id=run.id, seq=1, actor="det", event_type="step", summary=f"{cid} · goto /{i}",
                                status="ok", data={"t_ms": 20 + i, "test_case_id": cid}),
                       RunEvent(run_id=run.id, seq=2, actor="det", event_type="environment", summary="Browser environment recorded",
                                status="ok", data={"environment": {"browser": "chromium", "version": str(i), "os": "Windows"}}),
                       Finding(display_id=f"DEF-SCOPE-{uuid.uuid4().hex[:8]}", project_id=p.id, run_id=run.id,
                               test_case_id=cid, title=f"finding-{i}", severity="low", status="confirmed",
                               expected="a", actual="b")])
            ids.append((p.id, run.id, cid))
        await s.commit()

    for i, (pid, rid, cid) in enumerate(ids):
        listed = (await get(f"/api/runs?project={pid}")).json()["items"]
        assert {r["uuid"] for r in listed} == {rid}
        for path in ("plan", "planner", "ui", "api-calls", "perf", "security", "environment",
                     "repairs", "regression", "policy", "usage"):
            response = await get(f"/api/runs/{rid}/{path}")
            assert response.status_code == 200, (path, response.text)
            body = response.json()
            assert body["run"]["id"] == rid
            assert f"CASE-{1-i}" not in json.dumps(body)
        calls = (await get(f"/api/runs/{rid}/api-calls")).json()["calls"]
        assert len(calls) == 1 and calls[0]["case"] == cid
        assert (await get(f"/api/runs/{rid}/security")).json()["summary"]["rules"]["P1"] == ("passed" if i == 0 else "failed")
        assert (await get(f"/api/runs/{rid}/perf")).json()["lighthouse"][0]["score"] == 80 + i
        assert (await get(f"/api/runs/{rid}/perf")).json()["web_vitals"][0]["path"] == f"/{i}"
        assert (await get(f"/api/runs/{rid}/environment")).json()["matrix"][0]["status"] == ("passed" if i == 0 else "failed")
        assert (await get(f"/api/runs/{rid}/ui")).json()["accessibility"][0]["rule"] == f"rule-{i}"
        assert (await get(f"/api/runs/{rid}/environment")).json()["environment"]["version"] == str(i)
        graph = (await get(f"/api/runs/{rid}/diagrams/coverage")).json()
        assert graph["nodes"] and all(f"CASE-{1-i}" not in n["id"] for n in graph["nodes"])

    assert (await get("/api/runs/missing/plan")).status_code == 404
    assert (await get(f"/api/runs/{ids[0][1]}/diagrams/missing")).status_code == 404
