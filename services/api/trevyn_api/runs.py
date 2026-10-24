"""Run execution in the control plane: the RunCtx implementation, event doorbell, approval gates, dispatch.
Postgres/SQLite is the source of truth. Runs are LangGraph graphs (trevyn_orch.graph) checkpointed next to it: a gate
interrupts the graph and the task returns; the approval decision dispatches `resume`, which continues from the checkpoint
in this process (no REDIS_URL) or in a Celery worker (REDIS_URL set) with the same code (blueprint Steps 3-4)."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from trevyn_contracts import CaseResult, Diagnosis, Target, TestCase, Verdict
from trevyn_orch.models import Usage
from langgraph.types import Command

from trevyn_orch import graph as rg
from trevyn_orch.pipeline import TERMINAL, check

from .db import (Approval, AuditLog, Environment, Evidence, Finding, ModelCall, Plan, Project, Run, RunEvent, Session, SiteMapRecord, now, uid)

log = logging.getLogger("trevyn.runs")
EVIDENCE_DIR = Path(os.getenv("EVIDENCE_DIR", "var/evidence"))
RESUME_WAIT_S = 30.0  # a decision can arrive before the graph has checkpointed its interrupt
STALE_AFTER = timedelta(minutes=15)
ACTIVITY_KINDS = ("node", "lane", "step", "verdict", "finding", "gate", "report", "diagnosis", "log")

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
    """Next human ID, numbered across the whole workspace: pages list every project together and resolve
    /findings/DEF-142 by display ID, so per-project numbering collided. A unique index (migration 0006) backs this."""
    async with Session() as s:
        ids = (await s.scalars(select(model.display_id).where(model.display_id.like(f"{prefix}-%")))).all()
    n = max([start - 1, *(int(i.rsplit("-", 1)[1]) for i in ids if i.rsplit("-", 1)[1].isdigit())]) + 1
    return f"{prefix}-{n:04d}" if prefix == "RUN" else f"{prefix}-{n}"


async def append_event(run_id: str, actor: str, event_type: str, summary: str, status: str | None = None,
                       data: dict | None = None, evidence_refs: list[str] | None = None) -> dict:
    async with _seq_locks[run_id]:
        for attempt in range(8):
            try:
                async with Session() as s:
                    # Postgres serializes writers of one run, while different runs proceed independently.
                    await s.execute(select(Run.id).where(Run.id == run_id).with_for_update())
                    seq = (await s.scalar(select(func.max(RunEvent.seq)).where(RunEvent.run_id == run_id)) or 0) + 1
                    ev = RunEvent(run_id=run_id, seq=seq, actor=actor, event_type=event_type, summary=summary, status=status,
                                  data=data or {}, evidence_refs=evidence_refs or [])
                    s.add(ev)
                    await s.commit()
                payload = event_json(ev)
                break
            except IntegrityError:
                if attempt == 7:
                    raise
                await asyncio.sleep(0.01 * (attempt + 1))  # SQLite does not support row-level FOR UPDATE
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
        self.counts = {key: (run.counts or {}).get(key, 0) for key in ("passed", "failed", "inconclusive")}
        self._cancel = False
        self._last_activity = 0.0

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
        from . import events
        await events.publish(self.project_id, "run_state", {"run": self.display_id, "uuid": self.run_id, "state": to})

    async def log(self, actor, kind, summary, status=None, data=None, evidence_ids=None) -> None:
        if kind == "verdict":
            key = {"ok": "passed", "failed": "failed", "warn": "failed", "inconclusive": "inconclusive"}.get(status or "")
            if key:
                self.counts[key] += 1
                async with Session() as s:
                    run = await s.get(Run, self.run_id)
                    run.counts = {**(run.counts or {}), **self.counts}
                    await s.commit()
        await append_event(self.run_id, actor, kind, summary, status, data, evidence_ids)
        if kind == "lane" and (data or {}).get("lane") == "ui":  # the island's progress ring
            from . import events
            await events.publish(self.project_id, "run_progress", {"run": self.display_id, "uuid": self.run_id,
                                                                   "done": data.get("done", 0), "total": data.get("total", 0)})
        await self._announce(kind, summary, status)
        await self._refresh_cancel()

    async def _announce(self, kind: str, summary: str, status: str | None) -> None:
        """The island's live line: what the run is doing right now. Verdicts, findings, gates and reports always go
        out; routine steps, lanes and node changes at most once a second so a busy run doesn't flood the feed."""
        if kind not in ACTIVITY_KINDS:
            return
        moment = time.monotonic()
        if kind in ("step", "lane", "node", "log") and moment - self._last_activity < 1.0:
            return
        self._last_activity = moment
        from . import events
        await events.publish(self.project_id, "run_activity", {"run": self.display_id, "uuid": self.run_id, "kind": kind,
                                                               "summary": summary[:160], "status": status or ""})

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
        from . import events
        await events.publish(self.project_id, "approval_created", {"id": ap.display_id, "run": self.display_id, "title": title})
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
                          evidence_ids: list[str], repair_prompt: str | None, category: str = "ui",
                          severity: str | None = None) -> str:
        if verdict.status == "confirmed" and not evidence_ids:  # every confirmed finding cites evidence
            verdict.status, verdict.reason = "needs_review", "no_evidence"
        severity = severity or ("low" if verdict.status == "inconclusive" else (
            "high" if tc.risk == "high" or set(tc.side_effects) & {"creates_order", "charges_card"} else "medium"))
        async with Session() as s:
            f = Finding(display_id=await next_display(Finding, self.project_id, "DEF", 142), project_id=self.project_id,
                        run_id=self.run_id, test_case_id=tc.test_case_id, title=tc.title, category=category, severity=severity, status=verdict.status,
                        board_column="triage" if verdict.status != "confirmed" else "investigating",
                        expected=tc.expected_result, actual=verdict.explanation or "", verdict=verdict.model_dump(),
                        repro_steps=[st.model_dump(exclude_none=True) for st in tc.steps if st.action != "reset"],
                        diagnosis=diag.model_dump() if diag else None, repair_prompt=repair_prompt, evidence_ids=evidence_ids)
            s.add(f)
            await s.commit()
        from . import events
        await events.publish(self.project_id, "finding_created", {"id": f.display_id, "run": self.display_id, "status": verdict.status,
                                                                  "severity": severity, "category": category})
        if verdict.status == "confirmed" and severity == "high":
            from .integrations import notify
            await notify(f"Trevyn confirmed {f.display_id} ({severity}): {tc.title}")
        if verdict.status in ("needs_review", "inconclusive"):
            await self.request_review(f.id, f.display_id, tc.title, verdict)
        return f.display_id

    async def request_review(self, finding_id: str, finding_display: str, title: str, verdict: Verdict) -> None:
        """Human in the loop for uncertain results: the rules could not prove or disprove this failure, so a person
        decides. Approve = it is a real bug (confirmed); reject = dismissed."""
        why = verdict.reason or verdict.rule or "the verifier could not prove it"
        async with Session() as s:
            ap = Approval(id=uid(), display_id=await next_display(Approval, self.project_id, "AP", 1), project_id=self.project_id,
                          subject_type="finding_review", subject_id=finding_id, title=f"Review {finding_display}: {title}"[:300],
                          reason=f"Uncertain result ({why}). Approve if this is a real bug, reject to dismiss it.",
                          risk="medium" if verdict.status == "needs_review" else "low")
            s.add(ap)
            await s.commit()
            ap_display = ap.display_id
        from . import events
        await events.publish(self.project_id, "approval_created", {"id": ap_display, "run": self.display_id, "title": f"Review {finding_display}"})

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
        site = await s.get(SiteMapRecord, plan.site_map_id) if getattr(plan, "site_map_id", None) else None
    paths = [p.get("path", "/") for p in ((site.content or {}).get("pages", []) if site else [])]
    repo_files = (getattr(plan, "repository_map", None) or {}).get("file_count", 0)
    return run, rg.Deps(ctx=Ctx(run), cases=[TestCase.model_validate(tc) for tc in plan.test_cases], target=target,
                        mode=plan.test_mode or "black_box", site_paths=paths, repo_files=repo_files,
                        repo_url=proj.repository_url if plan.test_mode == "gray_box" else None,
                        repo_sha=plan.repository_sha if plan.test_mode == "gray_box" else None)


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
            log.exception("run %s could not be marked FAILED", run_id)


# States in which a run is actively using the browser, network and CPU. A run waiting at an approval gate is not:
# a person may take hours, and the queue must not stall behind them.
EXECUTING = ("RUNNING", "COLLECTING_EVIDENCE", "VERIFYING", "FINDINGS_READY", "INCONCLUSIVE", "REPORTING", "CANCELLING")
SLOT_POLL_SECONDS = 3


async def wait_for_slot(run_id: str) -> bool:
    """One run executes at a time (lanes share one machine; overlapping runs made each other time out). A queued run
    starts when no other run is executing and no earlier-queued run is waiting (first come, first served). Checked in
    the database so it holds for in-process runs and for any number of Celery workers. False if cancelled meanwhile."""
    announced = None
    while True:
        async with Session() as s:
            me = await s.get(Run, run_id)
            if me is None or me.state not in ("QUEUED",) or me.cancel_requested:
                return me is not None and not me.cancel_requested
            blocker = await s.scalar(select(Run).where(Run.id != run_id, Run.state.in_(EXECUTING))
                                     .order_by(Run.started_at).limit(1))
            if blocker is None:
                blocker = await s.scalar(select(Run).where(Run.id != run_id, Run.state == "QUEUED",
                                                           Run.started_at < me.started_at).order_by(Run.started_at).limit(1))
        if blocker is None:
            return True
        if blocker.id != announced:
            announced = blocker.id
            note = f"Queued: waiting for {blocker.display_id} to finish (one run executes at a time)"
            await append_event(run_id, "det", "log", note, "waiting", {"blocked_by": blocker.display_id})
            from . import events
            await events.publish(me.project_id, "run_activity", {"run": me.display_id, "uuid": run_id, "kind": "queue",
                                                                 "summary": note, "status": "waiting"})
        await asyncio.sleep(SLOT_POLL_SECONDS)


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
        if not await wait_for_slot(run_id):
            await deps.ctx.state("CANCELLED", "cancelled while queued")  # QUEUED → CANCELLED is allowed
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
