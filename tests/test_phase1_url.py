"""URL-mode decisions are deterministic even when the planner receives bad model output."""
from __future__ import annotations

from trevyn_contracts import PageMap, PlanDraft, SiteMap
from trevyn_contracts import TestCase as Case
from trevyn_orch import planner
from trevyn_orch.models import Usage
from trevyn_runner.discover import crawl_url, path_of


def scan() -> SiteMap:
    return SiteMap(start_url="https://example.test/", crawled_at="2026-10-24T00:00:00Z", pages=[
        PageMap(path="/", buttons=["Sign in"], links=[{"text": "Login", "path": "/login"}]),
        PageMap(path="/login", fields=[{"label": "Email", "type": "email", "required": True}]),
    ])


def case(*, steps: list[dict], assertions: list[dict] | None = None) -> Case:
    return Case.model_validate({"test_case_id": "URL-001", "title": "Login", "expected_result": "Sign in works",
                                "steps": steps, "assertions": assertions or
                                [{"kind": "url", "subject": "/login", "op": "contains", "expected": "/login"}]})


def test_discovery_url_filter_keeps_only_same_origin():
    base = "https://example.test/start"
    assert crawl_url(base, "/login#section") == "https://example.test/login"
    assert crawl_url("http://example.test/", "https://example.test/login") == "https://example.test/login"
    assert path_of("https://example.test/login?q=a") == "/login"
    for href in ("https://other.test/login", "http://example.test/login", "//example.test:444/login",
                 "javascript:alert(1)", "https://user:pass@example.test/login"):
        assert crawl_url(base, href) is None


def test_url_validator_blocks_unseen_paths_reset_and_database_assertions():
    plan = PlanDraft(test_cases=[case(steps=[{"action": "reset"}, {"action": "goto", "target": "/invented"}],
                                     assertions=[{"kind": "db_row_count", "subject": "orders", "op": "eq", "expected": 1}])])
    errors = planner.validate(plan, ["example.test"], site_map=scan(), has_hook=False)
    assert any("reset" in error for error in errors)
    assert any("not found in the site map" in error for error in errors)
    assert any("db_row_count" in error for error in errors)


def test_url_validator_marks_write_controls_high_risk_for_human_gate():
    mapped = scan()
    mapped.pages[1].buttons.append("Place order")
    plan = PlanDraft(test_cases=[case(steps=[{"action": "goto", "target": "/login"},
                                            {"action": "click", "target": "role=button[name=Place order]"}])])
    assert planner.validate(plan, ["example.test"], site_map=mapped, has_hook=False) == []
    assert plan.test_cases[0].risk == "high"
    assert plan.test_cases[0].side_effects == ["writes"]


def test_url_validator_rejects_other_host_even_if_it_is_on_allowlist():
    plan = PlanDraft(test_cases=[case(steps=[{"action": "goto", "target": "https://cdn.test/login"}])])
    assert any("leaves the scanned site" in error for error in
               planner.validate(plan, ["example.test", "cdn.test"], site_map=scan(), has_hook=False))


def test_url_validator_rejects_invented_control_names():
    plan = PlanDraft(test_cases=[case(steps=[{"action": "goto", "target": "/login"},
                                            {"action": "fill", "target": "label=Invented field", "value": "x"}])])
    assert any("not found in the site map" in error for error in
               planner.validate(plan, ["example.test"], site_map=scan(), has_hook=False))


async def test_url_plan_is_grounded_and_source_is_recorded(monkeypatch):
    async def structured(**kwargs):
        assert "site_map" in kwargs["prompt"]
        assert "Password" not in "\n".join(kwargs["stable"])
        return PlanDraft(test_cases=[case(steps=[{"action": "goto", "target": "/login"},
                                                {"action": "fill", "target": "label=Email", "value": "qa@example.test"}])]), \
            Usage(node="planner", model="fake")

    monkeypatch.setattr(planner.adapter, "structured", structured)
    draft, usages, source = await planner.generate("Users can sign in", "https://example.test/", ["example.test"],
                                                    "black_box", site_map=scan(), has_hook=False)
    assert source == "model+sitemap"
    assert len(usages) == 1 and draft.test_cases[0].steps[1].target == "label=Email"
