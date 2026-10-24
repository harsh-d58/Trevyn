"""Step 4: runs as a checkpointed LangGraph graph. A high-risk case interrupts, the invocation returns, and a resume
(even from a freshly built graph and checkpointer, i.e. after a restart) continues from the checkpoint. No browser:
the runner piece is stubbed."""
import pytest
from langgraph.types import Command

from trevyn_contracts import Target, TestCase
from trevyn_orch import graph as rg
from trevyn_orch import pipeline as pl


def case(cid: str, risk: str = "low") -> TestCase:
    return TestCase(test_case_id=cid, title=f"case {cid}", steps=[{"action": "goto", "target": "/"}], expected_result="ok",
                    assertions=[{"kind": "url", "subject": "/", "op": "eq", "expected": "/"}], risk=risk)


class FakeCtx:
    def __init__(self, run_id: str, state: str = "QUEUED"):
        self.run_id, self.evidence_dir, self.cur = run_id, "var/evidence", state
        self.events: list[tuple[str, str]] = []
        self.approvals: dict[str, str] = {}

    async def state(self, to, reason=""):
        pl.check(self.cur, to)
        self.cur = to
        self.events.append(("state", to))

    async def log(self, actor, kind, summary, status=None, data=None, evidence_ids=None):
        self.events.append((kind, summary))

    async def open_gate(self, title, reason, risk):
        if title in self.approvals:
            return self.approvals[title], "AP-1", False
        self.approvals[title] = f"ap-{len(self.approvals) + 1}"
        return self.approvals[title], "AP-1", True

    async def add_evidence(self, kind, path, case_id):
        return "ev"

    async def add_finding(self, *a):
        return "DEF-1"

    async def record_model(self, usage, run_id):
        pass

    def cancelled(self):
        return False


@pytest.fixture
def ran(monkeypatch):
    """Stubs the runner: records which cases ran and reports no results (the run then completes cleanly)."""
    seen: list[str] = []

    async def fake_run_cases(ctx, approved, target):
        seen.extend(c.test_case_id for c in approved)
        return []
    monkeypatch.setattr(pl, "run_cases", fake_run_cases)
    return seen


CASES = [case("TC-1"), case("TC-2", "high"), case("TC-3")]
TARGET = Target(base_url="http://localhost:3100", allowed_hosts=["localhost"])


async def start(saver, run_id: str, ctx: FakeCtx):
    deps = rg.Deps(ctx=ctx, cases=CASES, target=TARGET)
    return await rg.build(saver).ainvoke({"run_id": run_id, "case_ids": [c.test_case_id for c in CASES]}, rg.thread(run_id), context=deps)


async def resume(saver, run_id: str, ctx: FakeCtx, approve: bool):
    deps = rg.Deps(ctx=ctx, cases=CASES, target=TARGET)
    return await rg.build(saver).ainvoke(Command(resume={"approval_id": "ap-1", "approve": approve}), rg.thread(run_id), context=deps)


async def test_high_risk_case_interrupts_and_holds_nothing(tmp_path, ran):
    ctx = FakeCtx("r1")
    async with rg.checkpointer("", str(tmp_path / "lg.db")) as saver:
        out = await start(saver, "r1", ctx)
        assert rg.interrupted(out) and out["__interrupt__"][0].value["case_id"] == "TC-2"
        snap = await rg.build(saver).aget_state(rg.thread("r1"))
        assert snap.next == ("gate",) and snap.values["next"] == 0  # the gate node re-runs from the top on resume
    assert ctx.cur == "AWAITING_APPROVAL" and ran == []
    assert any(k == "gate" and "waiting for approval" in s for k, s in ctx.events)


async def test_resume_approve_runs_the_case(tmp_path, ran):
    ctx = FakeCtx("r2")
    async with rg.checkpointer("", str(tmp_path / "lg.db")) as saver:
        await start(saver, "r2", ctx)
        out = await resume(saver, "r2", ctx, True)
    assert not rg.interrupted(out) and ran == ["TC-1", "TC-2", "TC-3"] and ctx.cur == "COMPLETED"
    assert ("gate", "TC-2 approved") in ctx.events and len(ctx.approvals) == 1


async def test_resume_reject_skips_the_case(tmp_path, ran):
    ctx = FakeCtx("r3")
    async with rg.checkpointer("", str(tmp_path / "lg.db")) as saver:
        await start(saver, "r3", ctx)
        out = await resume(saver, "r3", ctx, False)
    assert out["skipped"] == ["TC-2"] and ran == ["TC-1", "TC-3"] and ctx.cur == "COMPLETED"
    assert ("gate", "TC-2 rejected, skipped") in ctx.events


async def test_resume_after_restart_continues_from_the_checkpoint(tmp_path, ran):
    db = str(tmp_path / "lg.db")
    first = FakeCtx("r4")
    async with rg.checkpointer("", db) as saver:  # process 1: runs to the gate, then goes away
        await start(saver, "r4", first)
    assert first.cur == "AWAITING_APPROVAL"
    second = FakeCtx("r4", state="AWAITING_APPROVAL")  # process 2: new ctx, new checkpointer, new graph object
    second.approvals = dict(first.approvals)  # the approval row lives in the database
    async with rg.checkpointer("", db) as saver:
        out = await resume(saver, "r4", second, True)
    assert not rg.interrupted(out) and ran == ["TC-1", "TC-2", "TC-3"] and second.cur == "COMPLETED"
    # picks up at the gate decision: no re-start, no second approval
    assert second.events[:2] == [("state", "RUNNING"), ("gate", "TC-2 approved")] and len(second.approvals) == 1


def test_pg_dsn():
    assert rg.pg_dsn("postgresql+asyncpg://u:p@h:5432/d") == "postgresql://u:p@h:5432/d"
    assert rg.pg_dsn("postgres://u:p@h/d") == "postgresql://u:p@h/d"
    assert rg.pg_dsn("sqlite+aiosqlite:///var/x.db") is None and rg.pg_dsn("") is None
