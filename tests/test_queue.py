"""Step 3-4 behaviour without a real Redis: doorbell over (fake) Redis, gates and cancel through the database, orphan reaping."""
import asyncio
import sys
import uuid

import fakeredis
import pytest
from starlette.requests import Request
from sqlalchemy import select

from trevyn_api import runs
from trevyn_api.main import stream_events
from trevyn_api.db import Approval, Environment, Plan, Project, Run, RunEvent, Session, init_db


@pytest.fixture
async def run(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)  # importing trevyn_api.main loads .env
    await init_db()
    async with Session() as s:
        p = Project(name="T", allowed_domains=["localhost"])
        s.add(p)
        await s.flush()
        e = Environment(project_id=p.id, name="demo", base_url="http://localhost:3100")
        s.add(e)
        await s.flush()
        pl = Plan(project_id=p.id, environment_id=e.id, requirement="r", source="template", test_cases=[])
        s.add(pl)
        await s.flush()
        r = Run(display_id=await runs.next_display(Run, p.id, "RUN", 1), project_id=p.id, plan_id=pl.id, environment_id=e.id, name="t", state="RUNNING")
        s.add(r)
        await s.commit()
        return r


async def test_doorbell_over_redis_reaches_subscriber(run, monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://fake")
    monkeypatch.setattr(runs, "_redis", fakeredis.aioredis.FakeRedis(decode_responses=True))
    sub = runs.subscribe(run.id)
    first = asyncio.ensure_future(anext(sub))
    await asyncio.sleep(0.05)  # let the subscription register
    await runs.append_event(run.id, "det", "log", "hello")
    got = await asyncio.wait_for(first, 2)
    assert got["summary"] == "hello" and got["seq"] == 1
    await sub.aclose()


async def test_two_live_streams_only_emit_their_own_run_events(run):
    async with Session() as s:
        other = Run(display_id=f"RUN-2-{uuid.uuid4().hex[:6]}", project_id=run.project_id, plan_id=run.plan_id,
                    environment_id=run.environment_id, name="other", state="RUNNING")
        s.add(other)
        await s.commit()
        other_id = other.id

    await asyncio.gather(
        runs.append_event(run.id, "det", "log", "first process"),
        runs.append_event(other_id, "det", "log", "second process"),
    )
    await asyncio.gather(
        runs.Ctx(run).log("det", "verdict", "first verdict", "ok"),
        runs.Ctx(other).log("det", "verdict", "second verdict", "failed"),
    )
    async with Session() as s:
        assert (await s.get(Run, run.id)).counts["passed"] == 1
        assert (await s.get(Run, other_id)).counts["failed"] == 1
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})
    async with Session() as s:
        first = await stream_events(run.id, request, after_seq=1, s=s)
        second = await stream_events(other_id, request, after_seq=1, s=s)
        try:
            a, b = await asyncio.gather(
                asyncio.wait_for(anext(first.body_iterator), 2),
                asyncio.wait_for(anext(second.body_iterator), 2),
            )
            assert a["id"] == b["id"] == "2"
            assert "first verdict" in a["data"] and "second verdict" not in a["data"]
            assert "second verdict" in b["data"] and "first verdict" not in b["data"]
        finally:
            await asyncio.gather(first.body_iterator.aclose(), second.body_iterator.aclose())


async def test_events_written_by_two_os_processes_keep_their_run_ids(run):
    async with Session() as s:
        other = Run(display_id=f"RUN-2-{uuid.uuid4().hex[:6]}", project_id=run.project_id, plan_id=run.plan_id,
                    environment_id=run.environment_id, name="other", state="RUNNING")
        s.add(other)
        await s.commit()
        other_id = other.id
    code = ("import asyncio, sys; from trevyn_api import runs; "
            "asyncio.run(runs.append_event(sys.argv[1], 'det', 'log', sys.argv[2]))")
    first, second = await asyncio.gather(
        asyncio.create_subprocess_exec(sys.executable, "-c", code, run.id, "process one",
                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE),
        asyncio.create_subprocess_exec(sys.executable, "-c", code, other_id, "process two",
                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE),
    )
    for proc, (_, err) in zip((first, second), await asyncio.gather(first.communicate(), second.communicate())):
        assert proc.returncode == 0, err.decode()
    async with Session() as s:
        first_events = (await s.scalars(select(RunEvent).where(RunEvent.run_id == run.id))).all()
        second_events = (await s.scalars(select(RunEvent).where(RunEvent.run_id == other_id))).all()
        assert [(e.seq, e.summary) for e in first_events] == [(1, "process one")]
        assert [(e.seq, e.summary) for e in second_events] == [(1, "process two")]


async def test_open_gate_is_idempotent_so_resume_can_reenter_it(run):
    ctx = runs.Ctx(run)
    first = await ctx.open_gate("Run risky test", "touches payments", "high")
    again = await ctx.open_gate("Run risky test", "touches payments", "high")
    assert first[2] is True and again[2] is False and again[0] == first[0]
    async with Session() as s:
        assert len((await s.scalars(select(Approval).where(Approval.subject_id == run.id))).all()) == 1


async def test_cancel_acts_on_a_run_parked_at_a_gate(run):
    async with Session() as s:
        (await s.get(Run, run.id)).state = "AWAITING_APPROVAL"
        s.add(Approval(display_id=f"AP-8-{uuid.uuid4().hex[:6]}", project_id=run.project_id, subject_type="run_gate", subject_id=run.id, title="t", reason="r", risk="high"))
        await s.commit()
    assert await runs.cancel_waiting(run.id) is True
    async with Session() as s:
        assert (await s.get(Run, run.id)).state == "CANCELLED"
        assert (await s.scalar(select(Approval).where(Approval.subject_id == run.id))).status == "expired"


async def test_runs_parked_at_a_gate_survive_a_restart(run):
    async with Session() as s:
        (await s.get(Run, run.id)).state = "AWAITING_APPROVAL"
        s.add(Approval(display_id=f"AP-7-{uuid.uuid4().hex[:6]}", project_id=run.project_id, subject_type="run_gate", subject_id=run.id, title="t", reason="r", risk="high"))
        await s.commit()
    assert run.id not in await runs.reap_stale(orphaned=True)
    async with Session() as s:
        assert (await s.get(Run, run.id)).state == "AWAITING_APPROVAL"
        assert (await s.scalar(select(Approval).where(Approval.subject_id == run.id))).status == "pending"


async def test_orphaned_runs_are_failed_and_their_gates_expire(run):
    async with Session() as s:
        s.add(Approval(display_id=f"AP-9-{uuid.uuid4().hex[:6]}", project_id=run.project_id, subject_type="run_gate", subject_id=run.id, title="t", reason="r", risk="high"))
        await s.commit()
    assert run.id in await runs.reap_stale(orphaned=True)
    async with Session() as s:
        assert (await s.get(Run, run.id)).state == "FAILED"
        assert (await s.scalar(select(Approval).where(Approval.subject_id == run.id))).status == "expired"


async def test_dispatch_is_local_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    seen = []

    async def fake(run_id):
        seen.append(run_id)
    monkeypatch.setattr(runs, "execute_run", fake)
    assert runs.dispatch("run", "abc") == "local"
    await asyncio.sleep(0)
    assert seen == ["abc"]
