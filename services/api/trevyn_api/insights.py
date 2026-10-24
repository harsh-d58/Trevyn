"""Overview, analytics, network and regression-history numbers computed from real DB rows (blueprint Step 9).
Charts the backend cannot compute yet (top suites, throughput, week strip, loop rings) are not returned."""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .common import Problem
from .db import Approval, Evidence, Finding, ModelCall, Plan, PolicyDecision, Repair, Run, RunEvent, session

router = APIRouter()
LABELS = {"ui": "UI", "api": "API", "perf": "Performance", "security": "Security", "compat": "Compatibility"}


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def _pct(cur: float, prev: float) -> float:
    return round((cur - prev) / prev * 100, 1) if prev else 0.0


def _tally(runs: list[Run], lo: datetime, hi: datetime) -> tuple[int, int, int]:
    p = f = i = 0
    for r in runs:
        if lo <= _aware(r.started_at) < hi:
            c = r.counts or {}
            p, f, i = p + c.get("passed", 0), f + c.get("failed", 0), i + c.get("inconclusive", 0)
    return p, f, i


@router.get("/api/dashboard/overview")
async def overview(s: AsyncSession = Depends(session)):
    now = datetime.now(UTC)
    week, prev = now - timedelta(days=7), now - timedelta(days=14)
    runs = (await s.scalars(select(Run))).all()
    findings = (await s.scalars(select(Finding))).all()
    repairs = (await s.scalars(select(Repair))).all()
    pending = len((await s.scalars(select(Approval).where(Approval.status == "pending"))).all())

    (p1, f1, i1), (p0, f0, i0) = _tally(runs, week, now + timedelta(days=1)), _tally(runs, prev, week)
    ex1, ex0 = p1 + f1 + i1, p0 + f0 + i0
    rate1, rate0 = (100 * p1 / ex1 if ex1 else 0), (100 * p0 / ex0 if ex0 else 0)
    open_confirmed = [f for f in findings if f.status == "confirmed" and f.board_column != "verified"]
    new1 = sum(1 for f in findings if f.status == "confirmed" and _aware(f.created_at) >= week)
    new0 = sum(1 for f in findings if f.status == "confirmed" and prev <= _aware(f.created_at) < week)
    ver = [r for r in repairs if r.outcome == "verified"]
    ver1 = sum(1 for r in ver if _aware(r.created_at) >= week)
    ver0 = sum(1 for r in ver if prev <= _aware(r.created_at) < week)

    kpis = [
        {"key": "tests_executed", "label": "Tests executed", "value": ex1, "delta": _pct(ex1, ex0), "deltaUnit": "%", "goodDirection": "up", "href": "/runs"},
        {"key": "pass_rate", "label": "Pass rate", "value": round(rate1, 1), "unit": "%", "delta": round(rate1 - rate0, 1) if ex0 else 0.0,
         "deltaUnit": "pts", "goodDirection": "up", "href": "/runs"},
        {"key": "confirmed_findings", "label": "Confirmed findings", "value": len(open_confirmed), "delta": _pct(new1, new0), "deltaUnit": "%",
         "goodDirection": "down", "href": "/board"},
        {"key": "regressions_prevented", "label": "Regressions prevented", "value": len(ver), "delta": _pct(ver1, ver0), "deltaUnit": "%",
         "goodDirection": "up", "href": "/regression"},
        {"key": "pending_approvals", "label": "Pending approvals", "value": pending, "delta": 0.0, "deltaUnit": "%", "goodDirection": "down", "href": "/approvals"},
    ]
    days = [(now - timedelta(days=13 - i)).date() for i in range(14)]
    health = []
    for d in days:
        day = [r for r in runs if _aware(r.started_at).date() == d]
        health.append({"date": d.isoformat(), "passed": sum((r.counts or {}).get("passed", 0) for r in day),
                       "failed": sum((r.counts or {}).get("failed", 0) for r in day), "runs": len(day)})
    cats = []
    for t, label in LABELS.items():
        sel = [f for f in findings if f.category == t]
        if sel:
            cats.append({"type": t, "label": label, "count": len(sel), "high": sum(1 for f in sel if f.severity == "high")})
    return {"kpis": kpis, "runHealth": health, "categories": cats, "loop": await _loop(s, now),
            "runsToday": sum(1 for r in runs if _aware(r.started_at).date() == now.date()),
            "gate": {"passRate": round(rate1, 1), "gate": float(os.getenv("RELEASE_GATE", "90")), "passed": p1, "failed": f1 + i1,
                     "release": "Last 7 days", "scope": "All projects", "weekDelta": round(rate1 - rate0, 1) if ex0 else 0.0}}


async def _loop(s: AsyncSession, now: datetime) -> dict:
    """Today's rings (UTC day): plan = cases in plans approved / created; prove = failures confirmed / found;
    decide = approvals decided / opened."""
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    plans = (await s.scalars(select(Plan).where(Plan.created_at >= day))).all()
    found = (await s.scalars(select(Finding).where(Finding.created_at >= day))).all()
    opened = (await s.scalars(select(Approval).where(Approval.created_at >= day))).all()
    return {"plan": [sum(len(p.test_cases or []) for p in plans if p.status == "approved"), sum(len(p.test_cases or []) for p in plans)],
            "prove": [sum(1 for f in found if f.status == "confirmed"), len(found)],
            "decide": [sum(1 for a in opened if a.status != "pending"), len(opened)]}


# ---- Step 9: analytics, network, engine placeholders, regression history ----
DUP_WINDOW_MS = 2000
_CASE_RE = re.compile(r"^\s*([\w.\-]+)\s*(?::|→)")
_STATUS_OUTCOME = {"ok": "passed", "failed": "failed", "warn": "failed", "inconclusive": "inconclusive"}


@router.get("/api/insights/analytics")
async def analytics(s: AsyncSession = Depends(session)):
    findings = (await s.scalars(select(Finding))).all()
    repairs = (await s.scalars(select(Repair))).all()
    calls = (await s.scalars(select(ModelCall))).all()
    denials = len((await s.scalars(select(PolicyDecision).where(PolicyDecision.allow.is_(False)))).all())

    verified_at: dict[str, datetime] = {}
    repaired: set[str] = set()
    for r in repairs:
        if r.outcome in ("approved", "verified", "failed"):
            repaired.add(r.finding_id)
        if r.outcome == "verified":
            t = _aware(r.created_at)
            if r.finding_id not in verified_at or t < verified_at[r.finding_id]:
                verified_at[r.finding_id] = t
    flow = {"detected": len(findings),
            "confirmed": sum(1 for f in findings if f.status == "confirmed"),
            "needs_review": sum(1 for f in findings if f.status == "needs_review"),
            "inconclusive": sum(1 for f in findings if f.status == "inconclusive"),
            "repaired": sum(1 for f in findings if f.id in repaired or f.id in verified_at),
            "verified": sum(1 for f in findings if f.id in verified_at)}

    heat: dict[tuple[int, int], int] = defaultdict(int)
    for f in findings:
        t = _aware(f.created_at)
        heat[(t.weekday(), t.hour)] += 1
    heatmap = [{"weekday": d, "hour": h, "count": c} for (d, h), c in sorted(heat.items())]

    weeks: dict[str, list[float]] = defaultdict(list)
    for f in findings:
        if f.status == "confirmed" and f.id in verified_at:
            done = verified_at[f.id]
            hours = max(0.0, (done - _aware(f.created_at)).total_seconds() / 3600)
            y, w, _ = done.isocalendar()
            weeks[f"{y}-W{w:02d}"].append(hours)
    mttr = [{"week": k, "mttrHours": round(sum(v) / len(v), 2), "count": len(v)} for k, v in sorted(weeks.items())]

    cost: dict[tuple[str, str], dict] = {}
    for c in calls:
        row = cost.setdefault((c.node, c.model), {"node": c.node, "model": c.model, "calls": 0, "costUsd": 0.0,
                                                  "inputTokens": 0, "outputTokens": 0})
        row["calls"] += 1
        row["costUsd"] = round(row["costUsd"] + (c.cost_usd or 0.0), 6)
        row["inputTokens"] += c.input_tokens or 0
        row["outputTokens"] += c.output_tokens or 0
    return {"flow": flow, "heatmap": heatmap, "mttr": mttr, "modelCost": sorted(cost.values(), key=lambda r: -r["costUsd"]),
            "totalCostUsd": round(sum(c.cost_usd or 0.0 for c in calls), 6), "policyDenials": denials}


def _read_network(uri: str) -> list[dict]:
    if not uri or uri.startswith("s3://"):
        return []
    p = Path(uri)
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []


@router.get("/api/insights/network")
async def network(s: AsyncSession = Depends(session)):
    evs = (await s.scalars(select(Evidence).where(Evidence.kind == "network"))).all()
    stats: dict[tuple[str, str], dict] = {}
    files = 0
    for ev in evs:
        reqs = _read_network(ev.uri)
        if not reqs:
            continue
        files += 1
        last: dict[tuple[str, str], float] = {}
        for r in sorted(reqs, key=lambda r: r.get("t") or 0):
            method = str(r.get("method") or "GET").upper()
            path = str(r.get("path") or r.get("url") or "")
            key = (method, path)
            row = stats.setdefault(key, {"method": method, "path": path, "requests": 0, "errors": 0, "duplicatePosts": 0})
            row["requests"] += 1
            st = r.get("status")
            if isinstance(st, int) and st >= 400:
                row["errors"] += 1
            t = r.get("t")
            if method == "POST" and isinstance(t, (int, float)):
                if key in last and t - last[key] <= DUP_WINDOW_MS:
                    row["duplicatePosts"] += 1
                last[key] = t
    endpoints = sorted(stats.values(), key=lambda r: (-r["requests"], r["method"], r["path"]))
    return {"files": files, "endpoints": endpoints,
            "totals": {"requests": sum(r["requests"] for r in endpoints), "errors": sum(r["errors"] for r in endpoints),
                       "duplicatePosts": sum(r["duplicatePosts"] for r in endpoints)}}


_ENGINES = {"perf": "performance", "security": "security", "compat": "compatibility"}


@router.get("/api/insights/{engine}")
async def engine_insights(engine: str):
    if engine not in _ENGINES:
        raise Problem(404, "Unknown insights engine", f"No insights for '{engine}'")
    return {"available": False, "reason": f"No {_ENGINES[engine]} runs yet"}


@router.get("/api/projects/{pid}/history")
async def project_history(pid: str, s: AsyncSession = Depends(session)):
    runs = (await s.scalars(select(Run).where(Run.project_id == pid).order_by(Run.started_at))).all()
    ids = [r.id for r in runs]
    outcomes: dict[str, dict[str, str]] = defaultdict(dict)  # case -> run_id -> outcome
    if ids:
        events = (await s.scalars(select(RunEvent).where(RunEvent.run_id.in_(ids), RunEvent.event_type == "verdict")
                                  .order_by(RunEvent.run_id, RunEvent.seq))).all()
        for e in events:  # later events in the same run overwrite earlier ones (latest outcome)
            m = _CASE_RE.match(e.summary or "")
            case_id = (e.data or {}).get("test_case_id") or (m.group(1) if m else None)
            if case_id and e.status in _STATUS_OUTCOME:
                outcomes[case_id][e.run_id] = _STATUS_OUTCOME[e.status]
        for f in (await s.scalars(select(Finding).where(Finding.run_id.in_(ids)))).all():
            if f.run_id not in outcomes[f.test_case_id]:
                outcomes[f.test_case_id][f.run_id] = "inconclusive" if f.status == "inconclusive" else "failed"
    run_list = [{"id": r.id, "displayId": r.display_id, "name": r.name, "trigger": r.trigger,
                 "startedAt": _aware(r.started_at).isoformat()} for r in runs]
    cases = []
    for cid in sorted(outcomes):
        per = outcomes[cid]
        results = [{"runId": r.id, "displayId": r.display_id, "outcome": per[r.id]} for r in runs if r.id in per]
        cases.append({"testCaseId": cid, "latest": results[-1]["outcome"] if results else None, "results": results})
    return {"projectId": pid, "runs": run_list, "cases": cases}
