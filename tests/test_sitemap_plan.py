"""No-AI plans from the site scan: real pages, links and forms become read-only cases that pass the planner's validator."""
from trevyn_contracts import PageMap, SiteMap
from trevyn_orch import planner


def site() -> SiteMap:
    return SiteMap(start_url="https://app.test/", crawled_at="2026-10-24T00:00:00Z", pages=[
        PageMap(path="/", title="Home", headings=["Welcome"], links=[{"text": "Pricing", "path": "/pricing"},
                {"text": "Delete account", "path": "/delete"}, {"text": "Contact", "path": "/contact"}]),
        PageMap(path="/pricing", title="Pricing", headings=["Plans"]),
        PageMap(path="/contact", title="Contact", headings=["Talk to us"], buttons=["Send"],
                fields=[{"label": "Email", "type": "email"}, {"label": "Message", "type": "textarea"}]),
    ])


def test_sitemap_plan_covers_pages_links_and_forms_read_only():
    plan = planner.sitemap_plan("https://app.test/", site(), "customers read the pricing page")
    ids = [tc.test_case_id for tc in plan.test_cases]
    assert ids[:2] == ["SMOKE-001", "SMOKE-002"] and {"PAGE-001", "PAGE-002", "PAGE-003", "NAV-001", "NAV-002", "FORM-001"} <= set(ids)
    assert not any("Delete" in tc.title for tc in plan.test_cases)  # write-like links are never clicked
    assert all(s.action in ("goto", "click") for tc in plan.test_cases for s in tc.steps)  # nothing typed or submitted
    assert all(tc.risk == "low" and not tc.side_effects for tc in plan.test_cases)
    assert planner.validate(plan, ["app.test"], site_map=site(), has_hook=False) == []


async def test_generate_without_a_model_uses_the_site_map(monkeypatch):
    async def no_model(**_):
        raise planner.ModelUnavailable("no key")
    monkeypatch.setattr(planner.adapter, "structured", no_model)
    plan, _, source = await planner.generate("pricing", "https://app.test/", ["app.test"], "black_box", site_map=site(), has_hook=False)
    assert source == "sitemap" and len(plan.test_cases) >= 6
