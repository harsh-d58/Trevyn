"""Run state machine (Part 6) and the execution pieces that graph.py composes into the parent graph and its subgraphs
(PLAN_MODES §3-4). The orchestrator owns no storage: it talks to the control plane through the RunCtx protocol."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Protocol

from trevyn_contracts import CaseResult, Diagnosis, RunnerJob, Target, TestCase, Verdict
from trevyn_runner.runner import run_job

from . import diagnose as dx
from . import passive
from .models import Usage
from .verifier import explain, verify

ALLOWED = {
    "CREATED": {"VALIDATING_INPUT", "CANCELLED"}, "VALIDATING_INPUT": {"BLOCKED", "PLANNING", "QUEUED"},
    "PLANNING": {"PLAN_REVIEW", "QUEUED", "FAILED"}, "PLAN_REVIEW": {"QUEUED", "CANCELLED"},
    "QUEUED": {"RUNNING", "CANCELLED"}, "RUNNING": {"AWAITING_APPROVAL", "COLLECTING_EVIDENCE", "CANCELLING", "FAILED"},
    "AWAITING_APPROVAL": {"RUNNING", "CANCELLED"}, "COLLECTING_EVIDENCE": {"VERIFYING", "FAILED"},
    "VERIFYING": {"FINDINGS_READY", "INCONCLUSIVE", "COMPLETED", "FAILED"}, "FINDINGS_READY": {"REPORTING", "FAILED"},
    "INCONCLUSIVE": {"REPORTING", "FAILED"}, "REPORTING": {"REPAIR_PROPOSED", "COMPLETED", "FAILED"},
    "REPAIR_PROPOSED": {"PATCH_REVIEW", "COMPLETED"}, "PATCH_REVIEW": {"REGRESSION", "COMPLETED"}, "REGRESSION": {"COMPLETED", "FAILED"}, "CANCELLING": {"CANCELLED"},
}
TERMINAL = {"BLOCKED", "CANCELLED", "COMPLETED", "FAILED"}
VERDICT_STATUS = {"passed": "ok", "confirmed": "failed", "needs_review": "warn", "inconclusive": "inconclusive"}


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
                          evidence_ids: list[str], repair_prompt: str | None, category: str = "ui",
                          severity: str | None = None) -> str: ...
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


async def lane(ctx: RunCtx, name: str, done: int, total: int, status: str = "running", note: str = "") -> None:
    await ctx.log("det", "lane", f"{name} lane · {done}/{total}" + (f" · {note}" if note else ""), status,
                  {"lane": name, "done": done, "total": total, "note": note})


# ---------- execute: UI lane ----------
async def run_cases(ctx: RunCtx, approved: list[TestCase], target: Target,
                    published: dict[str, str] | None = None) -> list[tuple[TestCase, CaseResult]] | None:
    """Runs the approved cases in the browser. After each case its latest screenshot is stored and announced, so the
    live view shows the run as it happens. Returns None when the run reached a terminal state (cancelled / infra error)."""
    published = published if published is not None else {}
    await ctx.log("det", "log", f"Playwright runner · chromium · {len(approved)} test cases")
    await lane(ctx, "ui", 0, len(approved))
    results: list[tuple[TestCase, CaseResult]] = []
    for n, tc in enumerate(approved, 1):
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
                          "ok" if s.ok else "failed", {"t_ms": s.t_ms, "error": s.error, "healed": getattr(s, "healed", None)})
        for a in case.assertions:
            await ctx.log("det", "assertion", f"{tc.test_case_id} · {a.message}", "ok" if a.ok else ("failed" if a.evaluated else "inconclusive"))
        if case.dup_posts:
            await ctx.log("det", "log", f"Duplicate request: {case.dup_posts[0].count}× POST {case.dup_posts[0].url} "
                                        f"{case.dup_posts[0].ms_apart} ms apart", "failed")
        shot = next((s.screenshot for s in reversed(case.steps) if s.screenshot and Path(s.screenshot).exists()), None)
        if shot:
            eid = await ctx.add_evidence("screenshot", shot, tc.test_case_id)
            published[shot] = eid
            await ctx.log("det", "screenshot", f"{tc.test_case_id} · after step {len(case.steps)}", case.outcome,
                          {"evidence_id": eid, "case": tc.test_case_id}, [eid])
        results.append((tc, case))
        await lane(ctx, "ui", n, len(approved), "running" if n < len(approved) else "ok")
    return results


# ---------- execute: passive security lane ----------
async def passive_lane(ctx: RunCtx, target: Target, paths: list[str]) -> list[passive.Issue]:
    """Fetches up to 5 same-site pages and applies header/cookie rules P1-P6. Never submits anything."""
    await lane(ctx, "security_passive", 0, 1)
    try:
        responses = await passive.fetch_pages(target.base_url, paths, target.allowed_hosts)
    except Exception as e:  # a passive check must never fail the run
        await lane(ctx, "security_passive", 1, 1, "warn", f"could not fetch pages: {type(e).__name__}")
        return []
    issues = passive.header_rules(responses)
    await lane(ctx, "security_passive", 1, 1, "ok", f"{len(responses)} pages checked, {len(issues)} issues")
    return issues


# ---------- verify subgraph pieces ----------
async def collect_evidence(ctx: RunCtx, results: list[tuple[TestCase, CaseResult]],
                           published: dict[str, str] | None = None) -> dict[str, dict[str, str]]:
    published = published or {}
    await ctx.state("COLLECTING_EVIDENCE")
    evidence: dict[str, dict[str, str]] = {}
    for tc, case in results:
        ids: dict[str, str] = {}
        for kind, path in case.artefacts.items():
            ids[await ctx.add_evidence(kind, path, tc.test_case_id)] = kind
        for s in case.steps:
            if s.screenshot:
                eid = published.get(s.screenshot) or await ctx.add_evidence("screenshot", s.screenshot, tc.test_case_id)
                ids[eid] = "screenshot"
        evidence[tc.test_case_id] = ids
    return evidence


def _repeat_policy(tc: TestCase, target: Target) -> tuple[bool, bool, str]:
    """(repeat?, reset first?, note). With a reset hook any case that starts with `reset` can repeat; on live sites only
    read-only, non-high-risk cases repeat (PHASE1 A6), because repeating a write could change real data."""
    if target.hook_url and (not tc.side_effects or tc.steps[0].action == "reset"):
        return True, True, ""
    if not tc.side_effects and tc.risk != "high":
        return True, False, ""
    return False, False, "not_repeated: changes data"


async def classify(ctx: RunCtx, results: list[tuple[TestCase, CaseResult]], target: Target,
                   evidence: dict[str, dict[str, str]]) -> tuple[int, int]:
    await ctx.state("VERIFYING")
    found = inconclusive = 0
    for tc, case in results:
        repeat, note = None, ""
        if case.outcome == "failed":
            again, _reset, note = _repeat_policy(tc, target)
            if again:
                await ctx.log("det", "log", f"Repeating {tc.test_case_id}" + (" after fixture reset" if _reset else " (read-only, fresh browser)"))
                rjob = RunnerJob(job_id=str(uuid.uuid4()), run_id=ctx.run_id, target=target, test_cases=[tc],
                                 out_dir=f"{ctx.evidence_dir}/{ctx.run_id}/{tc.test_case_id}-repeat")
                rres = await run_job(rjob)
                repeat = rres.cases[0] if rres.status == "completed" else None
        verdict = verify(tc, case, repeat, note)
        verdict.explanation = explain(tc, case)
        verdict.explanation_by = "rules"
        await ctx.log("det", "verdict", f"{tc.test_case_id} → {verdict.status} ({verdict.rule}{', ' + verdict.reason if verdict.reason else ''})",
                      VERDICT_STATUS[verdict.status])
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
    return found, inconclusive


def traffic_issues(results: list[tuple[TestCase, CaseResult]], target: Target) -> list[passive.Issue]:
    """P7-P9 from the network and console files the UI lane captured."""
    from urllib.parse import urlparse
    rows = []
    for tc, case in results:
        def load(kind):
            p = case.artefacts.get(kind)
            try:
                return json.loads(Path(p).read_text()) if p and Path(p).exists() else []
            except (OSError, ValueError):
                return []
        rows.append((tc.test_case_id, load("network"), load("console")))
    return passive.network_rules(rows, urlparse(target.base_url).hostname or "")


async def record_issues(ctx: RunCtx, issues: list[passive.Issue]) -> int:
    """Each passive issue becomes a confirmed finding (it is a deterministic fact) with its exact evidence on file."""
    n = 0
    out_dir = Path(ctx.evidence_dir) / ctx.run_id / "passive"
    out_dir.mkdir(parents=True, exist_ok=True)
    for i in issues:
        case_id = f"PASSIVE-{i.rule}"
        path = out_dir / f"{i.rule}.json"
        path.write_text(json.dumps({"rule": i.rule, "message": i.message, **i.evidence}, indent=1, default=str))
        eid = await ctx.add_evidence("passive_check", str(path), case_id)
        tc = TestCase(test_case_id=case_id, title=i.title, requirement_ref="PASSIVE",
                      steps=[{"action": "goto", "target": i.path or "/"}], expected_result=i.message,
                      assertions=[{"kind": "status", "subject": i.path or "/", "op": "lte", "expected": 399}], risk="low")
        verdict = Verdict(status="confirmed", rule=f"passive:{i.rule}", reproduced="deterministic",
                          checks={"V4": True, "V7": True}, explanation=i.message, explanation_by="rules")
        fid = await ctx.add_finding(tc, CaseResult(test_case_id=case_id, outcome="failed"), verdict, None, [eid], None,
                                    category=i.category, severity=i.severity)
        await ctx.log("det", "finding", f"{fid}: {i.title} [check {i.rule}]", "failed" if i.severity != "low" else "warn",
                      {"rule": i.rule, "category": i.category}, [eid])
        n += 1
    return n


async def report(ctx: RunCtx, found: int, inconclusive: int, checks: int = 0, lanes: dict | None = None) -> None:
    summary = f"{found} findings from tests, {checks} from passive checks, {inconclusive} inconclusive"
    await ctx.log("det", "report", summary, "ok", {"found": found, "checks": checks, "inconclusive": inconclusive, "lanes": lanes or {}})
    total = found + checks
    await ctx.state("FINDINGS_READY" if total else ("INCONCLUSIVE" if inconclusive else "COMPLETED"))
    if total or inconclusive:
        await ctx.state("REPORTING")
        await ctx.state("COMPLETED", summary)


async def verify_report(ctx: RunCtx, results: list[tuple[TestCase, CaseResult]], target: Target) -> None:
    """Kept for callers outside the graph: evidence → classify → report, without passive checks."""
    evidence = await collect_evidence(ctx, results)
    found, inconclusive = await classify(ctx, results, target, evidence)
    await report(ctx, found, inconclusive)
