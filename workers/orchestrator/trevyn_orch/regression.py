"""Regression selection, execution and comparison (blueprint Step 6). Baseline results are never modified."""
from __future__ import annotations

import uuid
from urllib.parse import urlparse

from trevyn_contracts import RunnerJob, Target, TestCase
from trevyn_runner.runner import run_job

MAX_CASES = 40


def routes(tc: TestCase) -> set[str]:
    return {urlparse(s.target or "").path for s in tc.steps if s.action == "goto"} - {"", "/", "/login"}


def select(cases: list[TestCase], original_id: str) -> list[TestCase]:
    """The original failing case, cases for the same requirement, and cases touching the same routes."""
    orig = next(c for c in cases if c.test_case_id == original_id)
    chosen = [orig] + [c for c in cases if c is not orig and (
        (orig.requirement_ref and c.requirement_ref == orig.requirement_ref) or (routes(c) & routes(orig)))]
    return chosen[:MAX_CASES]


def classify(base: str, rerun: str) -> str:
    if rerun == "errored":
        return "inconclusive"
    if base in ("failed", "errored"):
        return "fixed" if rerun == "passed" else "still_failing"
    return "unchanged_pass" if rerun == "passed" else "new_failure"


def outcome(rows: list[dict], original_id: str) -> str:
    orig = next((r for r in rows if r["test_case_id"] == original_id), None)
    if orig and orig["change"] == "fixed" and not any(r["change"] == "new_failure" for r in rows):
        return "verified"
    return "failed"


async def execute(ctx, cases: list[TestCase], target: Target, baseline: dict[str, str]) -> list[dict]:
    await ctx.state("RUNNING")
    ran = []
    for tc in cases:
        if ctx.cancelled():
            await ctx.state("CANCELLING", "kill switch")
            await ctx.state("CANCELLED")
            return []
        res = await run_job(RunnerJob(job_id=str(uuid.uuid4()), run_id=ctx.run_id, target=target, test_cases=[tc],
                                      out_dir=f"{ctx.evidence_dir}/{ctx.run_id}/{tc.test_case_id}"))
        if res.status != "completed":
            await ctx.log("det", "log", f"Runner infra error on {tc.test_case_id}: {res.error}", "failed")
            await ctx.state("FAILED", res.error or "runner infra error")
            return []
        case = res.cases[0]
        base = baseline.get(tc.test_case_id, "passed")
        change = classify(base, case.outcome)
        await ctx.log("det", "verdict", f"{tc.test_case_id}: baseline {base} → rerun {case.outcome} ({change})",
                      {"passed": "ok", "failed": "failed", "errored": "inconclusive", "skipped": "inconclusive"}[case.outcome])
        ran.append((tc, case, base, change))
    await ctx.state("COLLECTING_EVIDENCE")
    for tc, case, _, _ in ran:
        for kind, path in case.artefacts.items():
            await ctx.add_evidence(kind, path, tc.test_case_id)
    await ctx.state("VERIFYING")
    return [{"test_case_id": tc.test_case_id, "baseline_outcome": base, "rerun_outcome": case.outcome, "change": change}
            for tc, case, base, change in ran]
