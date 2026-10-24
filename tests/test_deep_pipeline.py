"""Phase 2 deep pipeline: parent graph with recon/verify subgraphs, the UI and passive lanes in parallel, node and lane
events, passive findings, the safe retest policy, the workspace event feed and the run graph endpoint.
No browser or network: the runner and page fetches are stubbed."""
from __future__ import annotations

import httpx
import pytest

from trevyn_contracts import CaseResult, RunnerResult, StepResult, Target, TestCase
from trevyn_orch import graph as rg
from trevyn_orch import passive
from trevyn_orch import pipeline as pl

from test_graph import FakeCtx, case

TARGET = Target(base_url="https://shop.test", allowed_hosts=["shop.test"])


class Ctx(FakeCtx):
    def __init__(self, run_id):
        super().__init__(run_id)
        self.findings: list[dict] = []
        self.data: list[tuple[str, dict]] = []

    async def log(self, actor, kind, summary, status=None, data=None, evidence_ids=None):
        await super().log(actor, kind, summary, status, data, evidence_ids)
        self.data.append((kind, data or {}))

    async def add_finding(self, tc, case_, verdict, diag, ev, prompt, category="ui", severity=None):
        self.findings.append({"case": tc.test_case_id, "status": verdict.status, "category": category, "severity": severity})
        return f"DEF-{len(self.findings)}"


@pytest.fixture
def stubs(monkeypatch):
    calls: list[str] = []

    async def fake_run_job(job):
        tc = job.test_cases[0]
        calls.append(tc.test_case_id + ("-repeat" if job.out_dir.endswith("-repeat") else ""))
        failed = tc.test_case_id != "TC-1"
        return RunnerResult(job_id=job.job_id, status="completed", cases=[CaseResult(
            test_case_id=tc.test_case_id, outcome="failed" if failed else "passed",
            steps=[StepResult(i=0, action="goto", ok=True, t_ms=5)])])

    async def fake_fetch(base, paths, hosts):
        assert paths == ["/cart"]
        return [passive.Response(url="https://shop.test/", status=200, headers={"Server": "nginx/1.25.3"},
                                 cookies=["session=abc; Path=/"])]

    async def fake_zap(url, out_dir, hosts):
        return None, [], "Docker unavailable in test"

    async def no_diag(tc, case_, ev):
        from trevyn_contracts import Diagnosis, Hypothesis
        return Diagnosis(hypotheses=[Hypothesis(statement="x", confidence="low")]), None, "rules"

    async def no_prompt(tc, case_, diag):
        return "fix it", None
    monkeypatch.setattr(pl, "run_job", fake_run_job)
    monkeypatch.setattr(passive, "fetch_pages", fake_fetch)
    monkeypatch.setattr(pl.zap, "run_baseline", fake_zap)
    async def no_compat(ctx, cases, target):
        await pl.lane(ctx, "compat", 1, 1, "warn", "not run in unit test")
    monkeypatch.setattr(pl, "compat_lane", no_compat)
    async def no_repo(ctx, url, sha):
        await pl.lane(ctx, "repo", 1, 1, "ok", "not applicable")
        return []
    monkeypatch.setattr(pl, "repo_lane", no_repo)
    async def no_performance(ctx, target, paths):
        await pl.lane(ctx, "performance", 1, 1, "warn", "not run in unit test")
        return []
    monkeypatch.setattr(pl, "performance_lane", no_performance)
    monkeypatch.setattr(pl.dx, "diagnose", no_diag)
    monkeypatch.setattr(pl.dx, "repair_prompt", no_prompt)
    return calls


async def test_parallel_lanes_passive_findings_and_safe_retest(tmp_path, stubs):
    cases = [case("TC-1"), case("TC-2"), case("TC-3")]
    cases[2].side_effects = ["creates_order"]
    ctx = Ctx("run-deep")
    ctx.evidence_dir = str(tmp_path)
    deps = rg.Deps(ctx=ctx, cases=cases, target=TARGET, mode="black_box", site_paths=["/cart"])
    async with rg.checkpointer(sqlite_path=str(tmp_path / "cp.db")) as saver:
        await rg.build(saver).ainvoke({"run_id": "run-deep", "case_ids": [c.test_case_id for c in cases]},
                                      rg.thread("run-deep"), context=deps)

    # safe retest: the read-only failure repeats, the one that creates an order does not
    assert stubs == ["TC-1", "TC-2", "TC-3", "TC-2-repeat"]
    nodes = {(d["node"], d["phase"]) for k, d in ctx.data if k == "node"}
    for n in ("intake", "recon.site_map", "gate", "lane_ui", "lane_passive", "lane_zap", "lane_compat", "lane_repo", "lane_performance", "verify.classify", "verify.record", "report"):
        assert (n, "end") in nodes, n
    assert ("recon.repo_map", "start") not in nodes  # gray box only
    lanes = {d["lane"] for k, d in ctx.data if k == "lane"}
    assert lanes == {"ui", "security_passive", "security_zap", "compat", "repo", "performance"}
    sec = {f["case"]: f for f in ctx.findings if f["case"].startswith("PASSIVE-")}
    assert {"PASSIVE-P1", "PASSIVE-P2", "PASSIVE-P3", "PASSIVE-P4", "PASSIVE-P5", "PASSIVE-P6"} <= set(sec)
    assert sec["PASSIVE-P1"] == {"case": "PASSIVE-P1", "status": "confirmed", "category": "security", "severity": "medium"}
    assert ctx.cur == "COMPLETED"
    assert any(k == "report" for k, _ in ctx.data)


def test_repeat_policy():
    ro, write, risky = case("A"), case("B"), case("C", "high")
    write.side_effects = ["creates_order"]
    assert pl._repeat_policy(ro, TARGET)[0] is True
    assert pl._repeat_policy(write, TARGET) == (False, False, "not_repeated: changes data")
    assert pl._repeat_policy(risky, TARGET)[0] is False
    hooked = Target(base_url="http://localhost:3100", allowed_hosts=["localhost"], hook_url="http://localhost:3100/__hook")
    assert pl._repeat_policy(ro, hooked) == (True, True, "")


def test_header_rules_clean_page_has_no_issues():
    good = passive.Response(url="https://shop.test/", status=200, headers={
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'", "Strict-Transport-Security": "max-age=1",
        "X-Content-Type-Options": "nosniff", "Server": "nginx"}, cookies=["session=1; HttpOnly; Secure; SameSite=Lax"])
    assert passive.header_rules([good]) == []


def test_network_rules():
    net = [{"url": "https://shop.test/", "method": "GET"}, {"url": "http://cdn.other/x.js", "method": "GET"},
           {"url": "https://shop.test/api/cart", "method": "POST", "status": 502}]
    rules = {i.rule: i for i in passive.network_rules([("TC-1", net, [{"type": "error", "text": "boom"}])], "shop.test")}
    assert set(rules) == {"P7", "P8", "P9"}
    assert rules["P9"].severity == "high" and rules["P9"].category == "network"


async def test_workspace_events_feed_and_run_graph():
    from trevyn_api import events
    from trevyn_api.db import init_db
    from trevyn_api.main import app
    await init_db()
    await events.publish("proj-1", "run_state", {"run": "RUN-1", "state": "RUNNING"})
    await events.publish("proj-2", "finding_created", {"id": "DEF-1"})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        items = (await c.get("/api/events", params={"project": "proj-1"})).json()["items"]
        assert [i["type"] for i in items] == ["run_state"]
        everything = (await c.get("/api/events")).json()["items"]
        after = (await c.get("/api/events", params={"after_id": everything[0]["id"]})).json()["items"]
        assert len(after) == len(everything) - 1
        assert (await c.get("/api/runs/nope/graph")).status_code == 404


async def test_display_ids_are_unique_across_projects():
    from trevyn_api import runs
    from trevyn_api.db import Approval, Project, Session, init_db
    await init_db()
    async with Session() as s:
        a, b = Project(name="A", allowed_domains=["a.test"]), Project(name="B", allowed_domains=["b.test"])
        s.add_all([a, b])
        await s.flush()
        first = await runs.next_display(Approval, a.id, "AP", 1)
        s.add(Approval(display_id=first, project_id=a.id, subject_type="run_gate", subject_id="x", title="t", reason="r", risk="low"))
        await s.commit()
        assert await runs.next_display(Approval, b.id, "AP", 1) != first


def test_status_follows_redirects():
    from trevyn_runner.runner import final_status
    net = [{"path": "/dist", "url": "https://t.test/dist", "status": 301, "location": "https://t.test/dist/"},
           {"path": "/dist/", "url": "https://t.test/dist/", "status": 200}]
    assert final_status(net, "/dist") == 200
    assert final_status(net[:1], "/dist") == 301  # the redirect target never loaded
    assert final_status(net, "/missing") is None


def test_a_crash_during_verify_can_end_the_run():
    for state in ("COLLECTING_EVIDENCE", "VERIFYING", "FINDINGS_READY", "INCONCLUSIVE", "REPORTING"):
        pl.check(state, "FAILED")


async def test_overview_has_todays_loop():
    from trevyn_api.db import init_db
    from trevyn_api.main import app
    await init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        body = (await c.get("/api/dashboard/overview")).json()
    assert set(body["loop"]) == {"plan", "prove", "decide"}
    assert all(len(v) == 2 and v[0] <= v[1] for v in body["loop"].values())
    assert isinstance(body["runsToday"], int)
