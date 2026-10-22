"""Run execution in the control plane: the RunCtx implementation, SSE doorbell, approval gates.
Postgres/SQLite is the source of truth; the in-process bus is only a doorbell (Part 5.3).
Single-process for now; the same RunCtx moves behind Celery + Redis pub/sub later (Part 7)."""
from __future__ import annotations

import asyncio
import hashlib
import logging
from collections import defaultdict
from pathlib import Path

from sqlalchemy import func, select

from trevyn_contracts import CaseResult, Diagnosis, Target, TestCase, Verdict
from trevyn_orch.models import Usage
from trevyn_orch.pipeline import TERMINAL, check, execute

from .db import Approval, AuditLog, Evidence, Finding, ModelCall, Run, RunEvent, Session, now

log = logging.getLogger("trevyn.runs")
EVIDENCE_DIR = Path(__import__("os").getenv("EVIDENCE_DIR", "var/evidence"))

subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
gates: dict[str, asyncio.Future] = {}
cancel_flags: set[str] = set()
_seq_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


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
    for q in list(subscribers[run_id]):
        q.put_nowait(payload)
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

    async def state(self, to: str, reason: str = "") -> None:
        async with Session() as s:
            run = await s.get(Run, self.run_id)
            check(run.state, to)
            frm, run.state = run.state, to
            if to in TERMINAL:
                run.ended_at = now()
                run.counts = {**run.counts, **self.counts}
            await s.commit()
        await append_event(self.run_id, "det", "state", f"{frm} → {to}" + (f" · {reason}" if reason else ""), to.lower(),
                           {"from": frm, "to": to})

    async def log(self, actor, kind, summary, status=None, data=None, evidence_ids=None) -> None:
        if kind == "verdict":
            key = {"ok": "passed", "failed": "failed", "warn": "failed", "inconclusive": "inconclusive"}.get(status or "")
            if key:
                self.counts[key] += 1
        await append_event(self.run_id, actor, kind, summary, status, data, evidence_ids)

    async def gate(self, title: str, reason: str, risk: str) -> bool:
        async with Session() as s:
            ap = Approval(display_id=await next_display(Approval, self.project_id, "AP", 1), project_id=self.project_id,
                          subject_type="run_gate", subject_id=self.run_id, title=title, reason=reason, risk=risk)
            s.add(ap)
            await s.commit()
        await append_event(self.run_id, "human", "gate", f"{ap.display_id}: {title} — waiting for approval", "waiting",
                           {"approval_id": ap.id, "display_id": ap.display_id})
        fut = gates[ap.id] = asyncio.get_running_loop().create_future()
        try:
            return await fut
        finally:
            gates.pop(ap.id, None)

    async def add_evidence(self, kind: str, path: str, case_id: str) -> str:
        p = Path(path)
        data = p.read_bytes()
        async with Session() as s:
            ev = Evidence(run_id=self.run_id, test_case_id=case_id, kind=kind, uri=str(p), sha256=hashlib.sha256(data).hexdigest(),
                          bytes=len(data))
            s.add(ev)
            await s.commit()
        return ev.id

    async def add_finding(self, tc: TestCase, case: CaseResult, verdict: Verdict, diag: Diagnosis | None,
                          evidence_ids: list[str], repair_prompt: str | None) -> str:
        if verdict.status == "confirmed" and not evidence_ids:  # Part 1.3 rule 4
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
        return f.display_id

    async def record_model(self, usage: Usage, run_id: str) -> None:
        await record_model(usage, run_id)

    def cancelled(self) -> bool:
        return self.run_id in cancel_flags


async def start(run: Run, cases: list[TestCase], target: Target) -> None:
    ctx = Ctx(run)
    try:
        await ctx.state("VALIDATING_INPUT")
        await ctx.state("QUEUED", "policy allowed")
        await execute(ctx, cases, target)
    except Exception as e:  # infrastructure failure, never "the app has bugs"
        log.exception("run %s crashed", run.id)
        try:
            await ctx.state("FAILED", f"{type(e).__name__}: {e}"[:300])
        except Exception:
            pass
