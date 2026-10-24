"""Public GitHub connection is verified, recorded, and kept with the generated plan."""
from __future__ import annotations

import httpx
import pytest
from trevyn_api import main, repositories
from trevyn_api.db import Environment, Project, Session, SiteMapRecord, init_db
from trevyn_contracts import PageMap, SiteMap
from trevyn_orch.planner import smoke_plan


@pytest.mark.parametrize("url", [
    "http://github.com/org/repo", "https://evil.example/org/repo", "https://github.com/org/repo/tree/main",
    "https://github.com/org/repo?token=x", "https://user:pass@github.com/org/repo", "https://github.com/../repo",
])
def test_rejects_untrusted_or_ambiguous_repository_urls(url):
    with pytest.raises(repositories.RepositoryError):
        repositories.parse_github_url(url)


def test_repo_map_prioritizes_the_live_app_over_vendored_files():
    prefix, source, tests, manifests = repositories.select_repo_paths([
        "bower_components/pkg/test/basic.html", "examples/react/src/App.jsx", "examples/react/package.json",
        "cypress/e2e/spec.cy.js", "examples/vue/src/App.vue", "package.json",
    ], "/examples/react/dist/")
    assert prefix == "examples/react/"
    assert source[0] == "examples/react/src/App.jsx"
    assert tests == ["cypress/e2e/spec.cy.js"]
    assert "examples/react/package.json" in manifests


async def test_inspect_public_repository_follows_github_rename_and_maps_tests(monkeypatch):
    requests = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        path = request.url.path
        if path == "/repos/old/Trevyn":
            return httpx.Response(301, headers={"Location": "https://api.github.com/repositories/123"})
        if path == "/repositories/123":
            return httpx.Response(200, json={"full_name": "new/Trevyn", "private": False, "default_branch": "main"})
        if path == "/repos/new/Trevyn/commits/main":
            return httpx.Response(200, json={"sha": "a" * 40, "commit": {"tree": {"sha": "b" * 40}}})
        if path == f"/repos/new/Trevyn/git/trees/{'b' * 40}":
            return httpx.Response(200, json={"tree": [
                {"type": "blob", "path": "pyproject.toml"}, {"type": "blob", "path": "tests/test_core.py"},
                {"type": "blob", "path": "services/api/main.py"}], "truncated": False})
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(repositories.httpx, "AsyncClient",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    info = await repositories.inspect_public_repo("https://github.com/old/Trevyn.git")
    assert info.url == "https://github.com/new/Trevyn" and info.sha == "a" * 40
    assert info.file_map["suggested_test_commands"] == ["python -m pytest -q"]
    assert info.file_map["test_files"] == ["tests/test_core.py"]
    assert all(method == "GET" for method, _ in requests)


async def test_project_connection_is_saved_and_copied_to_gray_plan(monkeypatch):
    await init_db()
    async with Session() as session:
        project = Project(name="Repository link", allowed_domains=["example.test"])
        session.add(project)
        await session.flush()
        env = Environment(project_id=project.id, name="test", base_url="https://example.test/")
        session.add(env)
        await session.flush()
        scan = SiteMapRecord(project_id=project.id, environment_id=env.id,
                             content=SiteMap(start_url=env.base_url, crawled_at="2026-10-24T00:00:00Z",
                                             pages=[PageMap(path="/")]).model_dump())
        session.add(scan)
        await session.commit()
        project_id = project.id

    async def fake_inspect(url, ref, *, site_path):
        assert (url, ref) == ("https://github.com/old/Trevyn", "main")
        assert site_path == "/"
        return repositories.RepositoryInfo(url="https://github.com/new/Trevyn", full_name="new/Trevyn",
                                           ref="main", sha="a" * 40,
                                           file_map={"repository": "new/Trevyn", "test_files": ["tests/test_core.py"]})

    async def fake_generate(*args, **kwargs):
        assert kwargs["repository_map"]["repository"] == "new/Trevyn"
        return smoke_plan(args[1]), [], "template"

    monkeypatch.setattr(main.repositories, "inspect_public_repo", fake_inspect)
    monkeypatch.setattr(main.planner, "generate", fake_generate)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        unlinked = await client.post(f"/api/projects/{project_id}/plans",
                                     json={"requirement": "Home loads", "mode": "gray_box"})
        assert unlinked.status_code == 422
        linked = await client.put(f"/api/projects/{project_id}/repository",
                                  json={"url": "https://github.com/old/Trevyn", "ref": "main"})
        assert linked.status_code == 200, linked.text
        assert linked.json()["url"] == "https://github.com/new/Trevyn"
        listed = (await client.get("/api/projects")).json()["items"]
        assert next(p for p in listed if p["id"] == project_id)["repository"]["sha"] == "a" * 40
        planned = await client.post(f"/api/projects/{project_id}/plans",
                                    json={"requirement": "Home loads", "mode": "gray_box"})
        assert planned.status_code == 201, planned.text
        assert planned.json()["repository_sha"] == "a" * 40
        assert planned.json()["repository_map"]["repository"] == "new/Trevyn"
