"""Exercise URL + public GitHub connection through the API using an isolated local SQLite DB.

Usage: .venv\\Scripts\\python.exe tests/manual_todomvc_api.py
This does not touch the configured Supabase database or require an AI key.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path

import httpx

Path("var").mkdir(exist_ok=True)
probe_id = uuid.uuid4().hex[:8]
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///var/todomvc_api_{probe_id}.db"
os.environ["EVIDENCE_DIR"] = f"var/todomvc_api_evidence_{probe_id}"
os.environ["LLM_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["REDIS_URL"] = ""
os.environ["AUTH_MODE"] = "off"
os.environ["OPA_URL"] = ""

from trevyn_api.db import init_db
from trevyn_api.main import app


async def main() -> int:
    await init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        project = await client.post("/api/projects", json={"name": "TodoMVC public probe",
                                    "base_url": "https://todomvc.com/examples/react/dist/", "authorised": True})
        project.raise_for_status()
        pid = project.json()["id"]
        repo = await client.put(f"/api/projects/{pid}/repository",
                                json={"url": "https://github.com/tastejs/todomvc"})
        repo.raise_for_status()
        print(f"Repository: {repo.json()['url']} @ {repo.json()['sha'][:8]}")
        plan = await client.post(f"/api/projects/{pid}/plans", json={"mode": "gray_box",
                                 "requirement": "A new todo appears when the user presses Enter"})
        plan.raise_for_status()
        body = plan.json()
        print(f"Plan: {body['source']}, {len(body['test_cases'])} cases, repo {body['repository_sha'][:8]}, "
              f"{len(body['site_map']['pages'])} scanned pages")
        await client.post(f"/api/plans/{body['id']}/approve")
        run = await client.post("/api/runs", json={"plan_id": body["id"]},
                                headers={"Idempotency-Key": str(uuid.uuid4())})
        run.raise_for_status()
        run_id = run.json()["id"]
        for _ in range(120):
            state = (await client.get(f"/api/runs/{run_id}")).json()
            if state["state"] in ("COMPLETED", "FAILED", "CANCELLED", "BLOCKED"):
                print(f"Run: {run_id} {state['state']}, counts={state['counts']}")
                return 0 if state["state"] == "COMPLETED" and state["counts"].get("passed") == 2 else 1
            await asyncio.sleep(1)
        print(f"Run {run_id} did not finish within 120 seconds")
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
