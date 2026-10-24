"""The PDF report's data and template: every quality section renders with its explanation, must-fix and suggested
lists, from stored run data only (rule-based narrative here, so no model is called)."""
from trevyn_api import report, runs
from trevyn_api.db import Environment, Finding, Plan, Project, Run, Session, init_db


async def test_report_renders_every_section_from_run_data():
    await init_db()
    async with Session() as s:
        p = Project(name="Report shop", allowed_domains=["shop.test"])
        s.add(p)
        await s.flush()
        e = Environment(project_id=p.id, name="qa", base_url="https://shop.test/")
        s.add(e)
        await s.flush()
        pl = Plan(project_id=p.id, environment_id=e.id, requirement="Shoppers can check out", source="model", test_cases=[
            {"test_case_id": "TC-1", "title": "Checkout works", "steps": [{"action": "goto", "target": "/"}],
             "expected_result": "ok", "assertions": [{"kind": "url", "subject": "page", "op": "contains", "expected": "/"}]}])
        s.add(pl)
        await s.flush()
        r = Run(display_id=await runs.next_display(Run, p.id, "RUN", 1), project_id=p.id, plan_id=pl.id,
                environment_id=e.id, name="Report run", state="COMPLETED", counts={"total": 1, "failed": 1})
        s.add(r)
        await s.flush()
        s.add(Finding(display_id=await runs.next_display(Finding, p.id, "DEF", 142), project_id=p.id, run_id=r.id,
                      test_case_id="PASSIVE-P1", title="Missing Content-Security-Policy header", category="security",
                      severity="medium", status="confirmed", expected="CSP sent", actual="missing", verdict={"rule": "passive:P1"}))
        await s.commit()
        facts = await report.collect(s, r.id)
    story = report.rule_narrative(facts)
    assert [x.key for x in story.sections] == list(report.SECTIONS)
    html = report.TEMPLATES.get_template("report.html.j2").render(
        f=facts, n=story, notes={x.key: x for x in story.sections}, sections=report.SECTIONS, titles=report.TITLES,
        source="rules", generated="now")
    for title in report.TITLES.values():
        assert title.replace("&", "&amp;") in html
    assert html.count("What this means") == len(report.SECTIONS) and "Action plan" in html
    assert "Missing Content-Security-Policy header" in html and story.overall_risk in ("medium", "high")
