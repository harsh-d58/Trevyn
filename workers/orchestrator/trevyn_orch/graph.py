"""Runs as a LangGraph parent graph with subgraphs (PLAN_MODES §3-4):

    intake → recon (subgraph) → gate (loop, interrupts per high-risk case) → execute lanes in parallel (Send) → verify
    (subgraph) → report

Checkpointed state holds references only; everything else is loaded by the control plane and passed as runtime context
(`Deps`). A high-risk case calls `interrupt()`: the invocation returns, the run stays AWAITING_APPROVAL with no process
held, and `Command(resume=...)` continues it from the checkpoint, in any process, after a restart. Every node emits
`node` events (start / end / waiting / failed) and lanes emit `lane` events, so the dashboard draws the graph live."""
from __future__ import annotations

import functools
import os
import sys
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, TypedDict

from langgraph.errors import GraphInterrupt
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import Send, interrupt

from trevyn_contracts import CaseResult, Target, TestCase

from . import passive
from . import pipeline as pl

SQLITE_PATH = os.getenv("LANGGRAPH_DB", "var/langgraph.db")

# What the dashboard draws: parent nodes, subgraph children and parallel lanes, with the modes each applies to.
TOPOLOGY: list[dict] = [
    {"id": "intake", "label": "Intake", "detail": "Load plan, mode and budget"},
    {"id": "recon", "label": "Recon", "detail": "What Trevyn knows about the target", "children": [
        {"id": "recon.site_map", "label": "Site map", "modes": ["black_box", "gray_box"]},
        {"id": "recon.repo_map", "label": "Repository map", "modes": ["gray_box"]},
    ]},
    {"id": "gate", "label": "Approval gate", "detail": "High-risk cases wait for a person"},
    {"id": "execute", "label": "Execute", "detail": "Lanes run in parallel", "lanes": [
        {"id": "lane_ui", "lane": "ui", "label": "UI · Playwright"},
        {"id": "lane_passive", "lane": "security_passive", "label": "Security · passive checks"},
        {"id": "lane_zap", "lane": "security_zap", "label": "Security · ZAP baseline"},
        {"id": "lane_compat", "lane": "compat", "label": "Compatibility · browsers"},
        {"id": "lane_repo", "lane": "repo", "label": "Repository · OSV and Gitleaks", "modes": ["gray_box"]},
        {"id": "lane_performance", "lane": "performance", "label": "Performance · Lighthouse"},
    ]},
    {"id": "verify", "label": "Verify", "detail": "Deterministic verdicts", "children": [
        {"id": "verify.collect", "label": "Collect evidence"},
        {"id": "verify.classify", "label": "Classify + retest"},
        {"id": "verify.traffic", "label": "Network + console checks"},
        {"id": "verify.record", "label": "Record check findings"},
    ]},
    {"id": "report", "label": "Report", "detail": "Summary and final state"},
]


def merge(a: dict | None, b: dict | None) -> dict:
    return {**(a or {}), **(b or {})}


class RunState(TypedDict, total=False):
    run_id: str
    mode: str
    case_ids: list[str]
    next: int  # index of the next case the gate has not looked at
    approved: list[str]
    skipped: list[str]
    done: bool  # a terminal state was reached early (cancelled / runner infra failure)
    lanes: Annotated[dict, merge]  # lane -> status, written by parallel branches


@dataclass
class Deps:
    ctx: pl.RunCtx
    cases: list[TestCase]
    target: Target
    mode: str = "black_box"
    site_paths: list[str] = field(default_factory=list)
    repo_files: int = 0
    repo_url: str | None = None
    repo_sha: str | None = None
    approval_obligations: list[str] = field(default_factory=list)
    results: list[tuple[TestCase, CaseResult]] = field(default_factory=list)  # lane_ui → verify, same invocation
    published: dict[str, str] = field(default_factory=dict)  # screenshot path → evidence id
    issues: list[passive.Issue] = field(default_factory=list)  # passive lane + traffic checks → verify.record
    evidence: dict[str, dict[str, str]] = field(default_factory=dict)
    found: int = 0
    inconclusive: int = 0
    checks: int = 0

    def case(self, cid: str) -> TestCase:
        return next(c for c in self.cases if c.test_case_id == cid)


def node(name: str):
    """Announces a node's lifecycle on the run's event stream. An interrupt is reported as `waiting`, not a failure."""
    def deco(fn):
        @functools.wraps(fn)
        async def wrapped(state: RunState, runtime: Runtime[Deps]):
            ctx = runtime.context.ctx
            await ctx.log("det", "node", f"{name} started", "running", {"node": name, "phase": "start"})
            t0 = time.monotonic()
            try:
                out = await fn(state, runtime)
            except GraphInterrupt:
                await ctx.log("det", "node", f"{name} waiting for approval", "waiting", {"node": name, "phase": "waiting"})
                raise
            except Exception as e:
                await ctx.log("det", "node", f"{name} failed: {type(e).__name__}", "failed", {"node": name, "phase": "failed"})
                raise
            await ctx.log("det", "node", f"{name} finished", "ok", {"node": name, "phase": "end", "ms": int((time.monotonic() - t0) * 1000)})
            return out
        return wrapped
    return deco


# ---------- parent nodes ----------
@node("intake")
async def intake(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    await pl.start(d.ctx)
    await d.ctx.log("det", "log", f"Mode {d.mode.replace('_', '-')} · {len(d.cases)} cases planned")
    return {"next": 0, "approved": [], "skipped": [], "mode": d.mode, "lanes": {}}


@node("gate")
async def gate(state: RunState, runtime: Runtime[Deps]) -> dict:
    """Admits low-risk cases up to the first undecided high-risk one, then interrupts for it. Re-executed from the top
    on resume, so everything before `interrupt` is idempotent (open_gate reuses the approval it already opened)."""
    d, i = runtime.context, state.get("next", 0)
    approved, skipped = list(state.get("approved", [])), list(state.get("skipped", []))
    while i < len(state["case_ids"]):
        tc = d.case(state["case_ids"][i])
        i += 1
        production_gate = "requires_approval:production" in d.approval_obligations and bool(tc.side_effects)
        if tc.risk != "high" and not production_gate:
            approved.append(tc.test_case_id)
            continue
        ap_id = await pl.open_gate(d.ctx, tc, production=production_gate)
        decision: Any = interrupt({"run_id": state["run_id"], "case_id": tc.test_case_id, "approval_id": ap_id})
        ok = bool(decision.get("approve")) if isinstance(decision, dict) else bool(decision)
        await pl.close_gate(d.ctx, tc, ok)
        (approved if ok else skipped).append(tc.test_case_id)
        break
    return {"next": i, "approved": approved, "skipped": skipped}


def after_gate(state: RunState):
    if state["next"] < len(state["case_ids"]):
        return "gate"
    return [Send("lane_ui", state), Send("lane_passive", state), Send("lane_zap", state),
            Send("lane_compat", state), Send("lane_repo", state), Send("lane_performance", state)]


@node("lane_ui")
async def lane_ui(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    results = await pl.run_cases(d.ctx, [d.case(c) for c in state["approved"]], d.target, published=d.published)
    if results is None:
        return {"done": True, "lanes": {"ui": "failed"}}
    d.results = results
    return {"lanes": {"ui": "done"}}


@node("lane_passive")
async def lane_passive(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.issues.extend(await pl.passive_lane(d.ctx, d.target, d.site_paths))
    return {"lanes": {"security_passive": "done"}}


@node("lane_zap")
async def lane_zap(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.issues.extend(await pl.zap_lane(d.ctx, d.target))
    return {"lanes": {"security_zap": "done"}}


@node("lane_compat")
async def lane_compat(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    try:
        await pl.compat_lane(d.ctx, [d.case(c) for c in state["approved"]], d.target)
    except Exception as exc:
        await pl.lane(d.ctx, "compat", 1, 1, "warn", f"Compatibility unavailable: {type(exc).__name__}")
    return {"lanes": {"compat": "done"}}


@node("lane_repo")
async def lane_repo(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.issues.extend(await pl.repo_lane(d.ctx, d.repo_url if d.mode == "gray_box" else None, d.repo_sha))
    return {"lanes": {"repo": "done"}}


@node("lane_performance")
async def lane_performance(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.issues.extend(await pl.performance_lane(d.ctx, d.target, d.site_paths))
    return {"lanes": {"performance": "done"}}


@node("report")
async def report(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    if not state.get("done"):
        await pl.report(d.ctx, d.found, d.inconclusive, d.checks, state.get("lanes"))
    return {"done": True}


# ---------- recon subgraph ----------
@node("recon.site_map")
async def recon_site_map(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    note = f"{len(d.site_paths)} pages from the latest scan" if d.site_paths else "no site map (demo target or not scanned)"
    await d.ctx.log("det", "log", f"Recon · site map: {note}")
    return {}


@node("recon.repo_map")
async def recon_repo_map(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    await d.ctx.log("det", "log", f"Recon · repository map: {d.repo_files} files (read-only)")
    return {}


def build_recon():
    g = StateGraph(RunState, context_schema=Deps)
    g.add_node("site_map", recon_site_map)
    g.add_node("repo_map", recon_repo_map)
    g.add_edge(START, "site_map")
    g.add_conditional_edges("site_map", lambda s: "repo_map" if s.get("mode") == "gray_box" else END, ["repo_map", END])
    g.add_edge("repo_map", END)
    return g.compile()


# ---------- verify subgraph ----------
@node("verify.collect")
async def verify_collect(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.evidence = await pl.collect_evidence(d.ctx, d.results, d.published)
    return {}


@node("verify.classify")
async def verify_classify(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.found, d.inconclusive = await pl.classify(d.ctx, d.results, d.target, d.evidence)
    return {}


@node("verify.traffic")
async def verify_traffic(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    from .axe import parse_report as parse_axe
    from .lighthouse import parse_vitals
    import json
    for tc, case in d.results:
        axe_path = case.artefacts.get("axe")
        if axe_path:
            try:
                issues = parse_axe(json.loads(Path(axe_path).read_text(encoding="utf-8")))
                axe_evidence = [eid for eid, kind in d.evidence.get(tc.test_case_id, {}).items() if kind == "axe"]
                for issue in issues:
                    issue.evidence_ids.extend(axe_evidence)
                d.issues.extend(issues)
            except (OSError, ValueError, TypeError):
                await pl.lane(d.ctx, "accessibility", 1, 1, "warn", f"axe report unavailable for {tc.test_case_id}")
        vitals_path = case.artefacts.get("web_vitals")
        if vitals_path:
            try:
                _rows, vital_issues = parse_vitals(json.loads(Path(vitals_path).read_text(encoding="utf-8")))
                vital_evidence = [eid for eid, kind in d.evidence.get(tc.test_case_id, {}).items() if kind == "web_vitals"]
                for issue in vital_issues:
                    issue.evidence_ids.extend(vital_evidence)
                d.issues.extend(vital_issues)
            except (OSError, ValueError, TypeError):
                await pl.lane(d.ctx, "performance", 1, 1, "warn", f"web-vitals unavailable for {tc.test_case_id}")
    extra = pl.traffic_issues(d.results, d.target)
    await pl.record_traffic_summary(d.ctx, d.results, extra)
    d.issues.extend(extra)
    await d.ctx.log("det", "log", f"Network and console checks: {len(extra)} issues")
    return {}


@node("verify.record")
async def verify_record(state: RunState, runtime: Runtime[Deps]) -> dict:
    d = runtime.context
    d.checks = await pl.record_issues(d.ctx, d.issues)
    return {}


def build_verify():
    g = StateGraph(RunState, context_schema=Deps)
    g.add_node("collect", verify_collect)
    g.add_node("classify", verify_classify)
    g.add_node("traffic", verify_traffic)
    g.add_node("record", verify_record)
    g.add_conditional_edges(START, lambda s: END if s.get("done") else "collect", ["collect", END])
    g.add_edge("collect", "classify")
    g.add_edge("classify", "traffic")
    g.add_edge("traffic", "record")
    g.add_edge("record", END)
    return g.compile()


def build(checkpointer=None):
    g = StateGraph(RunState, context_schema=Deps)
    g.add_node("intake", intake)
    g.add_node("recon", build_recon())
    g.add_node("gate", gate)
    g.add_node("lane_ui", lane_ui)
    g.add_node("lane_passive", lane_passive)
    g.add_node("lane_zap", lane_zap)
    g.add_node("lane_compat", lane_compat)
    g.add_node("lane_repo", lane_repo)
    g.add_node("lane_performance", lane_performance)
    g.add_node("verify", build_verify())
    g.add_node("report", report)
    g.add_edge(START, "intake")
    g.add_edge("intake", "recon")
    g.add_edge("recon", "gate")
    g.add_conditional_edges("gate", after_gate, ["gate", "lane_ui", "lane_passive", "lane_zap", "lane_compat", "lane_repo", "lane_performance"])
    g.add_edge(["lane_ui", "lane_passive", "lane_zap", "lane_compat", "lane_repo", "lane_performance"], "verify")
    g.add_edge("verify", "report")
    g.add_edge("report", END)
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
    """AsyncPostgresSaver when DATABASE_URL is Postgres, else AsyncSqliteSaver on var/langgraph.db.
    On Windows, async psycopg cannot run on the Proactor event loop that Playwright needs, so checkpoints stay in
    the local SQLite file there (fine for workers on one machine). CHECKPOINTER=sqlite|postgres overrides."""
    dsn = pg_dsn(database_url if database_url is not None else os.getenv("DATABASE_URL", "").strip())
    mode = os.getenv("CHECKPOINTER", "sqlite" if sys.platform == "win32" else "auto")
    if mode == "sqlite":
        dsn = None
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
