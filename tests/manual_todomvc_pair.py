"""Manual public URL + GitHub acceptance probe. No project DB or AI key required.

Usage: .venv\\Scripts\\python.exe tests/manual_todomvc_pair.py
TodoMVC is a public automation practice app. The browser context is fresh and isolated.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from trevyn_api.repositories import inspect_public_repo
from trevyn_contracts import RunnerJob, Target, TestCase
from trevyn_runner.discover import discover
from trevyn_runner.runner import run_job

SITE = "https://todomvc.com/examples/react/dist/"
REPO = "https://github.com/tastejs/todomvc"


async def main() -> int:
    repo = await inspect_public_repo(REPO, site_path="/examples/react/dist/")
    print(f"GitHub: {repo.url} @ {repo.ref} ({repo.sha[:8]}), {repo.file_map['file_count']} files")
    site = await discover(SITE, ["todomvc.com"], max_pages=5)
    print(f"Site scan: {len(site.pages)} pages, {len(site.errors)} errors")
    if not site.pages or site.errors:
        return 1
    todo = TestCase.model_validate({
        "test_case_id": "TODOMVC-001", "title": "A todo appears after adding it",
        "steps": [{"action": "goto", "target": "/examples/react/dist/"},
                  {"action": "fill", "target": "label=New Todo Input", "value": "Trevyn public demo check"},
                  {"action": "press", "target": "label=New Todo Input", "value": "Enter"}],
        "expected_result": "One todo is visible after pressing Enter",
        "assertions": [{"kind": "ui_text", "subject": "css=.todo-list", "op": "contains",
                        "expected": "Trevyn public demo check"},
                       {"kind": "count", "subject": "css=.todo-list li", "op": "eq", "expected": 1}],
    })
    job = RunnerJob(job_id="public-todomvc", run_id="manual-todomvc", target=Target(base_url=SITE,
                    allowed_hosts=["todomvc.com"]), test_cases=[todo], out_dir=str(Path("var/todomvc_pair_evidence")))
    result = await run_job(job)
    for case in result.cases:
        print(f"{case.test_case_id}: {case.outcome}, {len(case.steps)} steps, {len(case.assertions)} assertions")
        for step in case.steps:
            if not step.ok:
                print(f"  step {step.i}: {step.error}")
        for assertion in case.assertions:
            print(f"  assertion {assertion.i}: {'pass' if assertion.ok else assertion.message}")
    print(f"Evidence: {job.out_dir}")
    return 0 if result.status == "completed" and all(c.outcome == "passed" for c in result.cases) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
