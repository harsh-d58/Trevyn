"""Run execution in the control plane: the RunCtx implementation, event doorbell, approval gates, dispatch.
Postgres/SQLite is the source of truth. Runs are LangGraph graphs (trevyn_orch.graph) checkpointed next to it: a gate
interrupts the graph and the task returns; the approval decision dispatches `resume`, which continues from the checkpoint
in this process (no REDIS_URL) or in a Celery worker (REDIS_URL set) with the same code (blueprint Steps 3-4)."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from trevyn_contracts import CaseResult, Diagnosis, Target, TestCase, Verdict
from trevyn_orch.models import Usage
from langgraph.types import Command

from trevyn_orch import graph as rg
from trevyn_orch.pipeline import TERMINAL, check

from .db import (Approval, AuditLog, Environment, Evidence, Finding, ModelCall, Plan, Project, Run, RunEvent, Session, now)

log = logging.getLogger("trevyn.runs")
EVIDENCE_DIR = Path(os.getenv("EVIDENCE_DIR", "var/evidence"))
RESUME_WAIT_S = 30.0  # a decision can arrive before the graph has checkpointed its interrupt
STALE_AFTER = timedelta(minutes=15)

_local_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
_seq_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
_run_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)  # one graph invocation per run per process


def redis_url() -> str | None:
    return os.getenv("REDIS_URL") or None


_redis = None


def redis():
    global _redis
    if _redis is None:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(redis_url(), decode_responses=True)
    return _redis


# ---------- doorbell: Postgres is the truth, this only says "row seq N exists" ----------
async def publish(run_id: str, payload: dict) -> None:
    if redis_url():
        await redis().publish(f"run:{run_id}", json.dumps(payload))
    for q in list(_local_subscribers[run_id]):
        q.put_nowait(payload)


async def subscribe(run_id: str) -> AsyncIterator[dict]:
    """Yields event payloads as they are published, from any process when REDIS_URL is set."""
    if redis_url():
        ps = redis().pubsub()
        await ps.subscribe(f"run:{run_id}")
        try:
            async for m in ps.listen():
                if m.get("type") == "message":
                    yield json.loads(m["data"])
        finally:
            await ps.unsubscribe(f"run:{run_id}")
            await ps.aclose()
    else:
        q: asyncio.Queue = asyncio.Queue()
        _local_subscribers[run_id].add(q)
        try:
            while True:
                yield await q.get()
        finally:
            _local_subscribers[run_id].discard(q)


async def next_display(model, project_id: str, prefix: str, start: int) -> str:
    async with Session() as s:
        n = await s.scalar(select(func.count()).select_from(model).where(model.project_id == project_id))
    return f"{prefix}-{start + (n or 0):04d}" if prefix == "RUN" else f"{prefix}-{start + (n or 0)}"


async def append_event(run_id: str, actor: str, event_type: str, summary: str, status: str | None = None,
                       data: dict | None = None, evidence_refs: list[str] | None = None) -> dict:
    async with _seq_locks[run_id], Session() as s:
        seq = (await s.scalar(select(func.max(RunEvent.seq)).where(RunEvent.run_id == run_id)) or 0) + 1
        ev = RunEvent(run_id=run_id, seq=seq, actor=actor, event_type=event_type, summary=summary, status=status,
                      data=data or {}, evidence_refs=evidence_refs or [])
        s.add(ev)
        await s.commit()
    payload = event_json(ev)
    await publish(run_id, payload)
    return payload


def event_json(e: RunEvent) -> dict:
    return {"seq": e.seq, "ts": e.ts.isoformat(), "actor": e.actor, "event_type": e.event_type, "summary": e.summary,
            "status": e.status, "data": e.data, "evidence_refs": e.evidence_refs}


async def audit(actor: str, action: str, subject_type: str, subject_id: str, **details) -> None:
    async with Session() as s:
        s.add(AuditLog(actor=actor, action=action, subject_type=subject_type, subject_id=subject_id, details=details))
        await s.commit()


async def record_model(usage: Usage, run_id: str | None) -> None:
    async with Session() as s:
        s.add(ModelCall(run_id=run_id, **usage.model_dump()))
        await s.commit()


class Ctx:
    def __init__(self, run: Run):
        self.run_id, self.project_id, self.display_id = run.id, run.project_id, run.display_id
        self.evidence_dir = str(EVIDENCE_DIR)
        self.counts = {"passed": 0, "failed": 0, "inconclusive": 0}
        self._cancel = False

    async def _refresh_cancel(self) -> None:
        async with Session() as s:
            self._cancel = bool(await s.scalar(select(Run.cancel_requested).where(Run.id == self.run_id)))

    async def state(self, to: str, reason: str = "") -> None:
        async with Session() as s:
            run = await s.get(Run, self.run_id)
            check(run.state, to)
            frm, run.state = run.state, to
            if to in TERMINAL:
                run.ended_at = now()
                run.counts = {**run.counts, **self.counts}
            self._cancel = run.cancel_requested
            await s.commit()
        await append_event(self.run_id, "det", "state", f"{frm} → {to}" + (f" · {reason}" if reason else ""), to.lower(),
                           {"from": frm, "to": to})

    async def log(self, actor, kind, summary, status=None, data=None, evidence_ids=None) -> None:
        if kind == "verdict":
            key = {"ok": "passed", "failed": "failed", "warn": "failed", "inconclusive": "inconclusive"}.get(status or "")
            if key:
                self.counts[key] += 1
        await append_event(self.run_id, actor, kind, summary, status, data, evidence_ids)
        await self._refresh_cancel()

    async def open_gate(self, title: str, reason: str, risk: str) -> tuple[str, str, bool]:
        """Writes the approval for this gate, or returns the one already written (the graph re-enters the gate node on
        resume). Nothing waits here: the graph interrupts and the decision endpoint resumes it."""
        async with Session() as s:
            ap = await s.scalar(select(Approval).where(Approval.subject_type == "run_gate", Approval.subject_id == self.run_id,
                                                       Approval.title == title).order_by(Approval.created_at.desc()).limit(1))
            if ap:
                return ap.id, ap.display_id, False
            ap = Approval(display_id=await next_display(Approval, self.project_id, "AP", 1), project_id=self.project_id,
                          subject_type="run_gate", subject_id=self.run_id, title=title, reason=reason, risk=risk)
            s.add(ap)
            await s.commit()
            return ap.id, ap.display_id, True

    async def add_evidence(self, kind: str, path: str, case_id: str) -> str:
        from . import storage  # S3/MinIO when S3_* is set, else local disk
        uri, sha, size = await storage.store_evidence(self.run_id, self.project_id, case_id, kind, path)
        async with Session() as s:
            ev = Evidence(run_id=self.run_id, test_case_id=case_id, kind=kind, uri=uri, sha256=sha, bytes=size)
            s.add(ev)
            await s.commit()
        return ev.id

    async def add_finding(self, tc: TestCase, case: CaseResult, verdict: Verdict, diag: Diagnosis | None,
                          evidence_ids: list[str], repair_prompt: str | None) -> str:
        if verdict.status == "confirmed" and not evidence_ids:  # every confirmed finding cites evidence
            verdict.status, verdict.reason = "needs_review", "no_evidence"
        severity = "low" if verdict.status == "inconclusive" else (
            "high" if tc.risk == "high" or set(tc.side_effects) & {"creates_order", "charges_card"} else "medium")
        async with Session() as s:
            f = Finding(display_id=await next_display(Finding, self.project_id, "DEF", 142), project_id=self.project_id,
                        run_id=self.run_id, test_case_id=tc.test_case_id, title=tc.title, severity=severity, status=verdict.status,
                        board_column="triage" if verdict.status != "confirmed" else "investigating",
                        expected=tc.expected_result, actual=verdict.explanation or "", verdict=verdict.model_dump(),
                        repro_steps=[st.model_dump(exclude_none=True) for st in tc.steps if st.action != "reset"],
                        diagnosis=diag.model_dump() if diag else None, repair_prompt=repair_prompt, evidence_ids=evidence_ids)
            s.add(f)
            await s.commit()
        if verdict.status == "confirmed" and severity == "high":
            from .integrations import notify
            await notify(f"Trevyn confirmed {f.display_id} ({severity}): {tc.title}")
        return f.display_id

    async def record_model(self, usage: Usage, run_id: str) -> None:
        await record_model(usage, run_id)

    def cancelled(self) -> bool:
        return self._cancel


async def _load(run_id: str) -> tuple[Run, rg.Deps]:
    """Loads everything from the database, so a run can start or resume in this process or in a worker."""
    async with Session() as s:
        run = await s.get(Run, run_id)
        plan, env, proj = await s.get(Plan, run.plan_id), await s.get(Environment, run.environment_id), await s.get(Project, run.project_id)
    target = Target(base_url=env.base_url, allowed_hosts=proj.allowed_domains, hook_url=env.hook_url if env.local_runner else None,
                    hook_token=os.getenv("TREVYN_HOOK_TOKEN") or None)
    return run, rg.Deps(ctx=Ctx(run), cases=[TestCase.model_validate(tc) for tc in plan.test_cases], target=target)


async def _invoke(run_id: str, deps: rg.Deps, payload) -> None:
    """One graph invocation. Returns when the run finishes or interrupts at a gate (it then stays AWAITING_APPROVAL)."""
    try:
        async with rg.checkpointer() as saver:
            out = await rg.build(saver).ainvoke(payload, rg.thread(run_id), context=deps)
        if rg.interrupted(out):
            log.info("run %s waiting at a gate", run_id)
    except Exception as e:  # infrastructure failure, never "the app has bugs"
        log.exception("run %s crashed", run_id)
        try:
            await deps.ctx.state("FAILED", f"{type(e).__name__}: {e}"[:300])
        except Exception:
            pass


async def execute_run(run_id: str) -> None:
    async with _run_locks[run_id]:
        _, deps = await _load(run_id)
        try:
            await deps.ctx.state("VALIDATING_INPUT")
            await deps.ctx.state("QUEUED", "policy allowed")
        except Exception as e:
            log.exception("run %s failed validation", run_id)
            await deps.ctx.state("FAILED", f"{type(e).__name__}: {e}"[:300])
            return
        await _invoke(run_id, deps, {"run_id": run_id, "case_ids": [c.test_case_id for c in deps.cases]})


async def resume_run(run_id: str, approval_id: str, approve: bool) -> None:
    """Continues a run from its checkpoint after a gate decision. Safe to call twice: it only acts on a run that is
    AWAITING_APPROVAL with a pending interrupt for this approval."""
    async with _run_locks[run_id]:
        run, deps = await _load(run_id)
        if run.state != "AWAITING_APPROVAL":
            log.info("resume %s ignored: run is %s", run_id, run.state)
            return
        loop = asyncio.get_running_loop()
        deadline = loop.time() + RESUME_WAIT_S
        async with rg.checkpointer() as saver:
            while True:  # the run's own invocation may still be on its way to the interrupt (another worker)
                snap = await rg.build(saver).aget_state(rg.thread(run_id))
                if any(isinstance(i.value, dict) and i.value.get("approval_id") == approval_id for i in snap.interrupts):
                    break
                if loop.time() > deadline:
                    log.warning("resume %s: no interrupt waiting for approval %s", run_id, approval_id)
                    return
                await asyncio.sleep(0.25)
        await _invoke(run_id, deps, Command(resume={"approval_id": approval_id, "approve": approve}))


async def cancel_waiting(run_id: str) -> bool:
    """Cancel for a run parked at a gate: no process holds it, so the kill switch acts here. Running runs see
    `cancel_requested` before their next test case instead."""
    async with Session() as s:
        r = await s.get(Run, run_id)
        if r.state != "AWAITING_APPROVAL":
            return False
        for a in (await s.scalars(select(Approval).where(Approval.subject_id == run_id, Approval.status == "pending"))).all():
            a.status, a.decision_reason = "expired", "run cancelled"
        await s.commit()
    await Ctx(r).state("CANCELLED", "kill switch while awaiting approval")
    return True


_tasks: set[asyncio.Task] = set()


def dispatch(kind: str, ident: str, *args) -> str:
    """Queue `run`, `resume` (ident=run id, args=(approval_id, approve)) or `regression` work: Celery when REDIS_URL is
    set, else an in-process task. Returns where it went."""
    if redis_url():
        from . import worker
        {"run": worker.run_execute, "resume": worker.run_resume, "regression": worker.run_regression}[kind].delay(ident, *args)
        return "celery"
    from .repairs import run_regression
    t = asyncio.create_task({"run": execute_run, "resume": resume_run, "regression": run_regression}[kind](ident, *args))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return "local"


async def reap_stale(orphaned: bool = False) -> list[str]:
    """Marks unfinished runs FAILED. `orphaned=True` (in-process mode, at startup): every unfinished run died with the
    old process. Otherwise only runs with no event for STALE_AFTER (worker mode, scheduled). Runs AWAITING_APPROVAL are
    never reaped: no process holds them and they resume from their LangGraph checkpoint."""
    cutoff = datetime.now(UTC) - STALE_AFTER
    reaped = []
    async with Session() as s:
        runs = (await s.scalars(select(Run).where(Run.state.not_in([*TERMINAL, "AWAITING_APPROVAL"])))).all()
        for r in runs:
            last = await s.scalar(select(func.max(RunEvent.ts)).where(RunEvent.run_id == r.id)) or r.started_at
            last = last if last.tzinfo else last.replace(tzinfo=UTC)
            if orphaned or last < cutoff:
                reaped.append(r.id)
    for rid in reaped:
        async with Session() as s:
            r = await s.get(Run, rid)
            frm, r.state, r.ended_at = r.state, "FAILED", now()
            pending = (await s.scalars(select(Approval).where(Approval.subject_id == rid, Approval.status == "pending"))).all()
            for a in pending:
                a.status, a.decision_reason = "expired", "run stopped before a decision"
            await s.commit()
        why = "the API restarted while it was running" if orphaned else f"no progress for {int(STALE_AFTER.total_seconds() // 60)} minutes"
        await append_event(rid, "det", "state", f"{frm} → FAILED · stale: {why}", "failed", {"from": frm, "to": "FAILED", "reason": "stale"})
    return reaped
