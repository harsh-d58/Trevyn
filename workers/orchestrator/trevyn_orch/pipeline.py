"""Run state machine (Part 6) and the execution pipeline pieces (start, gates, run_cases, verify_report) that graph.py
composes. The orchestrator owns no storage: it talks to the control plane through the RunCtx protocol."""
from __future__ import annotations

import uuid
from typing import Protocol

from trevyn_contracts import CaseResult, Diagnosis, RunnerJob, Target, TestCase, Verdict
from trevyn_runner.runner import run_job

from . import diagnose as dx
from .models import Usage
from .verifier import explain, verify

ALLOWED = {
    "CREATED": {"VALIDATING_INPUT", "CANCELLED"}, "VALIDATING_INPUT": {"BLOCKED", "PLANNING", "QUEUED"},
    "PLANNING": {"PLAN_REVIEW", "QUEUED", "FAILED"}, "PLAN_REVIEW": {"QUEUED", "CANCELLED"},
    "QUEUED": {"RUNNING", "CANCELLED"}, "RUNNING": {"AWAITING_APPROVAL", "COLLECTING_EVIDENCE", "CANCELLING", "FAILED"},
    "AWAITING_APPROVAL": {"RUNNING", "CANCELLED"}, "COLLECTING_EVIDENCE": {"VERIFYING", "FAILED"},
    "VERIFYING": {"FINDINGS_READY", "INCONCLUSIVE", "COMPLETED"}, "FINDINGS_READY": {"REPORTING"}, "INCONCLUSIVE": {"REPORTING"},
    "REPORTING": {"REPAIR_PROPOSED", "COMPLETED"}, "REPAIR_PROPOSED": {"PATCH_REVIEW", "COMPLETED"},
    "PATCH_REVIEW": {"REGRESSION", "COMPLETED"}, "REGRESSION": {"COMPLETED", "FAILED"}, "CANCELLING": {"CANCELLED"},
}
TERMINAL = {"BLOCKED", "CANCELLED", "COMPLETED", "FAILED"}


class IllegalTransition(Exception):
    pass


def check(frm: str, to: str) -> None:
    if to not in ALLOWED.get(frm, set()):
        raise IllegalTransition(f"{frm} → {to}")


class RunCtx(Protocol):
    run_id: str
    evidence_dir: str

    async def state(self, to: str, reason: str = "") -> None: ...
    async def log(self, actor: str, kind: str, summary: str, status: str | None = None, data: dict | None = None,
                  evidence_ids: list[str] | None = None) -> None: ...
    async def open_gate(self, title: str, reason: str, risk: str) -> tuple[str, str, bool]: ...
    async def add_evidence(self, kind: str, path: str, case_id: str) -> str: ...
    async def add_finding(self, tc: TestCase, case: CaseResult, verdict: Verdict, diag: Diagnosis | None,
                          evidence_ids: list[str], repair_prompt: str | None) -> str: ...
    async def record_model(self, usage: Usage, run_id: str) -> None: ...
    def cancelled(self) -> bool: ...


def gate_title(tc: TestCase) -> str:
    return f"Run high-impact test {tc.test_case_id}"


async def start(ctx: RunCtx) -> None:
    await ctx.state("RUNNING")


async def open_gate(ctx: RunCtx, tc: TestCase) -> str:
    """Idempotent: re-entering the gate (as LangGraph does on resume) reuses the approval it already opened."""
    title = gate_title(tc)
    ap_id, display, created = await ctx.open_gate(title, tc.title, "high")
    if created:
        await ctx.state("AWAITING_APPROVAL", f"{tc.test_case_id} is high-risk")
        await ctx.log("human", "gate", f"{display}: {title} — waiting for approval", "waiting",
                      {"approval_id": ap_id, "display_id": display})
    return ap_id


async def close_gate(ctx: RunCtx, tc: TestCase, ok: bool) -> None:
    await ctx.state("RUNNING", "approved" if ok else "rejected")
    await ctx.log("human", "gate", f"{tc.test_case_id} {'approved' if ok else 'rejected, skipped'}", "ok" if ok else "skipped")


async def cancel(ctx: RunCtx) -> None:
    await ctx.state("CANCELLING", "kill switch")
    await ctx.state("CANCELLED")


async def run_cases(ctx: RunCtx, approved: list[TestCase], target: Target) -> list[tuple[TestCase, CaseResult]] | None:
    """Runs the approved cases. Returns None when the run already reached a terminal state (cancelled / infra failure)."""
    await ctx.log("det", "log", f"Playwright runner · chromium · {len(approved)} test cases")
    results: list[tuple[TestCase, CaseResult]] = []
    for tc in approved:
        if ctx.cancelled():
            await cancel(ctx)
            return None
        job = RunnerJob(job_id=str(uuid.uuid4()), run_id=ctx.run_id, target=target, test_cases=[tc],
                        out_dir=f"{ctx.evidence_dir}/{ctx.run_id}/{tc.test_case_id}")
        res = await run_job(job)
        if res.status != "completed":
            await ctx.log("det", "log", f"Runner infra error on {tc.test_case_id}: {res.error}", "failed")
            await ctx.state("FAILED", res.error or "runner infra error")
            return None
        case = res.cases[0]
        for s in case.steps:
            await ctx.log("det", "step", f"{tc.test_case_id} · {s.action} {(tc.steps[s.i].target or '')}"[:160],
                          "ok" if s.ok else "failed", {"t_ms": s.t_ms, "error": s.error})
        for a in case.assertions:
            await ctx.log("det", "assertion", f"{tc.test_case_id} · {a.message}", "ok" if a.ok else ("failed" if a.evaluated else "inconclusive"))
        if case.dup_posts:
            await ctx.log("det", "log", f"Duplicate request: {case.dup_posts[0].count}× POST {case.dup_posts[0].url} "
                                        f"{case.dup_posts[0].ms_apart} ms apart", "failed")
        results.append((tc, case))

    return results


async def verify_report(ctx: RunCtx, results: list[tuple[TestCase, CaseResult]], target: Target) -> None:
    await ctx.state("COLLECTING_EVIDENCE")
    evidence: dict[str, dict[str, str]] = {}
    for tc, case in results:
        ids: dict[str, str] = {}
        for kind, path in case.artefacts.items():
            ids[await ctx.add_evidence(kind, path, tc.test_case_id)] = kind
        for s in case.steps:
            if s.screenshot:
                ids[await ctx.add_evidence("screenshot", s.screenshot, tc.test_case_id)] = "screenshot"
        evidence[tc.test_case_id] = ids

    await ctx.state("VERIFYING")
    found = inconclusive = 0
    for tc, case in results:
        repeat, note = None, ""
        if case.outcome == "failed":
            safe = not tc.side_effects or tc.steps[0].action == "reset"
            if safe and target.hook_url:
                await ctx.log("det", "log", f"Repeating {tc.test_case_id} after fixture reset")
                rjob = RunnerJob(job_id=str(uuid.uuid4()), run_id=ctx.run_id, target=target, test_cases=[tc],
                                 out_dir=f"{ctx.evidence_dir}/{ctx.run_id}/{tc.test_case_id}-repeat")
                rres = await run_job(rjob)
                repeat = rres.cases[0] if rres.status == "completed" else None
            else:
                note = "not_repeated: unsafe"
        verdict = verify(tc, case, repeat, note)
        verdict.explanation = explain(tc, case)
        verdict.explanation_by = "rules"
        await ctx.log("det", "verdict", f"{tc.test_case_id} → {verdict.status} ({verdict.rule}{', ' + verdict.reason if verdict.reason else ''})",
                      {"passed": "ok", "confirmed": "failed", "needs_review": "warn", "inconclusive": "inconclusive"}[verdict.status])
        if verdict.status == "passed":
            continue
        ev = evidence[tc.test_case_id]
        diag = prompt = None
        if verdict.status in ("confirmed", "needs_review"):
            diag, usage, src = await dx.diagnose(tc, case, ev)
            if usage:
                await ctx.record_model(usage, ctx.run_id)
            await ctx.log("ai" if src == "model" else "det", "diagnosis", f"Hypothesis ({diag.hypotheses[0].confidence}): {diag.hypotheses[0].statement}"[:300])
            prompt, usage = await dx.repair_prompt(tc, case, diag)
            if usage:
                await ctx.record_model(usage, ctx.run_id)
            found += 1
        else:
            inconclusive += 1
        fid = await ctx.add_finding(tc, case, verdict, diag, list(ev), prompt)
        await ctx.log("det", "finding", f"{fid}: {tc.title} [{verdict.status}]", "failed" if verdict.status == "confirmed" else "warn")

    await ctx.state("FINDINGS_READY" if found else ("INCONCLUSIVE" if inconclusive else "COMPLETED"))
    if found or inconclusive:
        await ctx.state("REPORTING")
        await ctx.state("COMPLETED", f"{found} findings, {inconclusive} inconclusive")
