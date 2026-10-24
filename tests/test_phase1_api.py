"""A plan retains the exact site map used to generate it and reuses scans for one hour."""
from __future__ import annotations

import httpx
from trevyn_api import main
from trevyn_api.db import Environment, Project, Session, init_db
from trevyn_api.main import app
from trevyn_contracts import PageMap, SiteMap


async def test_plan_uses_cached_site_map_and_rescan_refreshes(monkeypatch):
    await init_db()
    async with Session() as session:
        project = Project(name="Scan test", allowed_domains=["example.test"])
        session.add(project)
        await session.flush()
        env = Environment(project_id=project.id, name="test", base_url="https://example.test/")
        session.add(env)
        await session.commit()
        project_id = project.id
    calls = 0

    async def fake_discover(url, hosts):
        nonlocal calls
        calls += 1
        assert url == "https://example.test/" and hosts == ["example.test"]
        return SiteMap(start_url=url, crawled_at="2026-10-24T00:00:00Z",
                       pages=[PageMap(path="/", title=f"Scan {calls}")])

    monkeypatch.setattr(main, "discover", fake_discover)
    monkeypatch.setattr(main.targets, "check_url", lambda _: None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post(f"/api/projects/{project_id}/plans", json={"requirement": "Home is readable"})
        assert first.status_code == 201, first.text
        second = await client.post(f"/api/projects/{project_id}/plans", json={"requirement": "Home is readable"})
        assert second.status_code == 201, second.text
        assert calls == 1
        assert first.json()["site_map_id"] == second.json()["site_map_id"]
        detail = await client.get(f"/api/plans/{first.json()['id']}")
        assert detail.json()["site_map"]["pages"][0]["title"] == "Scan 1"
        refreshed = await client.post(f"/api/projects/{project_id}/discover")
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["pages"][0]["title"] == "Scan 2"
        assert calls == 2
        # The original plan remains reviewable against the original scan.
        detail = await client.get(f"/api/plans/{first.json()['id']}")
        assert detail.json()["site_map"]["pages"][0]["title"] == "Scan 1"
