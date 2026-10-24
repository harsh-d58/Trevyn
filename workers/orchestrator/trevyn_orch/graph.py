"""Runs as a LangGraph graph (blueprint Step 4). The checkpointed state holds references only (run id, case ids, the
next case index, decided case ids); everything else is loaded by the control plane and passed in as runtime context.
A high-risk case calls `interrupt()`: the invocation returns, the run stays AWAITING_APPROVAL with no process held, and
`Command(resume=...)` continues it from the checkpoint, in any process, after a restart."""
from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import interrupt

from trevyn_contracts import CaseResult, Target, TestCase

from . import pipeline as pl

SQLITE_PATH = os.getenv("LANGGRAPH_DB", "var/langgraph.db")


class RunState(TypedDict, total=False):
    run_id: str
    case_ids: list[str]
    next: int  # index of the next case the gate has not looked at
    approved: list[str]
    skipped: list[str]
    done: bool  # a terminal state was reached early (cancelled / runner infra failure)


@dataclass
class Deps:
    ctx: pl.RunCtx
    cases: list[TestCase]
    target: Target
    results: list[tuple[TestCase, CaseResult]] = field(default_factory=list)  # run_cases → verify_report, same invocation

    def case(self, cid: str) -> TestCase:
        return next(c for c in self.cases if c.test_case_id == cid)


async def start(state: RunState, runtime: Runtime[Deps]) -> dict:
    await pl.start(runtime.context.ctx)
    return {"next": 0, "approved": [], "skipped": []}


async def gate(state: RunState, runtime: Runtime[Deps]) -> dict:
    """Admits low-risk cases up to the first undecided high-risk one, then interrupts for it. Re-executed from the top
    on resume, so everything before `interrupt` is idempotent (open_gate reuses the approval it already opened)."""
    d, i = runtime.context, state.get("next", 0)
    approved, skipped = list(state.get("approved", [])), list(state.get("skipped", []))
    while i < len(state["case_ids"]):
        tc = d.case(state["case_ids"][i])
        i += 1
        if tc.risk != "high":
            approved.append(tc.test_case_id)
            continue
        ap_id = await pl.open_gate(d.ctx, tc)
        decision: Any = interrupt({"run_id": state["run_id"], "case_id": tc.test_case_id, "approval_id": ap_id})
        ok = bool(decision.get("approve")) if isinstance(decision, dict) else bool(decision)
        await pl.close_gate(d.ctx, tc, ok)
        (approved if ok else skipped).append(tc.test_case_id)
        break
    return {"next": i, "approved": approved, "skipped": skipped}


def after_gate(state: RunState) -> str:
    return "gate" if state["next"] < len(state["case_ids"]) else "run_cases"


async def run_cases(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    results = await pl.run_cases(d.ctx, [d.case(c) for c in state["approved"]], d.target)
    if results is None:
        return {"done": True}
    d.results = results
    return {"done": False}


async def verify_report(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    await pl.verify_report(d.ctx, d.results, d.target)
    return {"done": True}


def build(checkpointer=None):
    g = StateGraph(RunState, context_schema=Deps)
    g.add_node("start", start)
    g.add_node("gate", gate)
    g.add_node("run_cases", run_cases)
    g.add_node("verify_report", verify_report)
    g.add_edge(START, "start")
    g.add_edge("start", "gate")
    g.add_conditional_edges("gate", after_gate, ["gate", "run_cases"])
    g.add_conditional_edges("run_cases", lambda s: END if s.get("done") else "verify_report", [END, "verify_report"])
    g.add_edge("verify_report", END)
    return g.compile(checkpointer=checkpointer)


def thread(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def pg_dsn(url: str) -> str | None:
    """A plain postgresql:// DSN for psycopg, or None when the database is SQLite."""
    if not url or url.startswith("sqlite"):
        return None
    scheme, rest = url.split("://", 1)
    return "postgresql://" + rest if scheme.startswith("postgres") else None


@asynccontextmanager
async def checkpointer(database_url: str | None = None, sqlite_path: str | None = None) -> AsyncIterator[Any]:
    """AsyncPostgresSaver when DATABASE_URL is Postgres, else AsyncSqliteSaver on var/langgraph.db."""
    dsn = pg_dsn(database_url if database_url is not None else os.getenv("DATABASE_URL", "").strip())
    if dsn:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        async with AsyncPostgresSaver.from_conn_string(dsn) as saver:
            await saver.setup()
            yield saver
    else:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        path = Path(sqlite_path or SQLITE_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(str(path)) as saver:
            await saver.setup()
            yield saver


def interrupted(result: Any) -> bool:
    return isinstance(result, dict) and bool(result.get("__interrupt__"))
