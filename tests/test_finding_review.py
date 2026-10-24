"""Human in the loop for uncertain results: an inconclusive finding asks a person, and the decision settles it."""
import httpx

from trevyn_api import runs
from trevyn_api.db import Environment, Finding, Plan, Project, Run, Session, init_db
from trevyn_api.main import app
from trevyn_contracts import CaseResult, TestCase, Verdict


async def test_inconclusive_finding_opens_a_review_that_confirms_it():
    await init_db()
    async with Session() as s:
        p = Project(name="Review", allowed_domains=["app.test"])
        s.add(p)
        await s.flush()
        e = Environment(project_id=p.id, name="qa", base_url="https://app.test/")
        s.add(e)
        await s.flush()
        pl = Plan(project_id=p.id, environment_id=e.id, requirement="r", source="model", test_cases=[])
        s.add(pl)
        await s.flush()
        run = Run(display_id=await runs.next_display(Run, p.id, "RUN", 1), project_id=p.id, plan_id=pl.id,
                  environment_id=e.id, name="review", state="VERIFYING")
        s.add(run)
        await s.commit()
        await s.refresh(run)
    tc = TestCase(test_case_id="TC-1", title="Filter shows active todos", steps=[{"action": "goto", "target": "/"}],
                  expected_result="Only active todos are listed",
                  assertions=[{"kind": "url", "subject": "page", "op": "contains", "expected": "/"}])
    verdict = Verdict(status="inconclusive", rule="V2", reason="action_not_executed", checks={})
    fid = await runs.Ctx(run).add_finding(tc, CaseResult(test_case_id="TC-1", outcome="errored"), verdict, None, [], None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        items = (await c.get("/api/approvals", params={"run": run.display_id})).json()["items"]
        assert len(items) == 1 and items[0]["category"] == "Uncertain diagnoses" and items[0]["run"] == run.display_id
        assert fid in items[0]["title"]
        assert (await c.post(f"/api/approvals/{items[0]['id']}/decision", json={"approve": True, "reason": ""})).status_code == 200
    async with Session() as s:
        from sqlalchemy import select
        f = await s.scalar(select(Finding).where(Finding.display_id == fid))
        assert f.status == "confirmed" and f.board_column == "investigating" and "confirmed by" in f.verdict["reason"]
