"""Overview, analytics, network and regression-history numbers computed from real DB rows (blueprint Step 9).
Charts the backend cannot compute yet (top suites, throughput, week strip, loop rings) are not returned."""
from __future__ import annotations

import asyncio
import json
import os
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .common import Problem
from . import storage
from .db import Approval, Evidence, Finding, ModelCall, Plan, PolicyDecision, Repair, Run, RunEvent, session

router = APIRouter()
LABELS = {"ui": "UI", "api": "API", "perf": "Performance", "security": "Security", "compat": "Compatibility"}


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


async def _scope(s: AsyncSession, run: str | None) -> Run | None:
    """`?run=` on any insight endpoint: a run uuid or display id narrows every number to that run."""
    if not run:
        return None
    found = await s.get(Run, run) or await s.scalar(select(Run).where(Run.display_id == run))
    if not found:
        raise Problem(404, "not_found", f"Run {run} not found")
    return found


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
async def overview(run: str | None = None, s: AsyncSession = Depends(session)):
    scoped = await _scope(s, run)
    now = datetime.now(UTC)
    # one run: its whole life counts, with no week-over-week comparison
    week, prev = (EPOCH, EPOCH) if scoped else (now - timedelta(days=7), now - timedelta(days=14))
    runs = [scoped] if scoped else (await s.scalars(select(Run))).all()
    findings = (await s.scalars(select(Finding).where(Finding.run_id == scoped.id) if scoped else select(Finding))).all()
    repairs = (await s.scalars(select(Repair).where(Repair.finding_id.in_([f.id for f in findings])) if scoped else select(Repair))).all()
    pq = select(Approval).where(Approval.status == "pending")
    pending = len((await s.scalars(pq.where(Approval.subject_id == scoped.id) if scoped else pq)).all())

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
    return {"kpis": kpis, "runHealth": health, "categories": cats, "loop": await _loop(s, now, scoped),
            "runsToday": sum(1 for r in runs if _aware(r.started_at).date() == now.date()),
            "gate": {"passRate": round(rate1, 1), "gate": float(os.getenv("RELEASE_GATE", "90")), "passed": p1, "failed": f1 + i1,
                     "release": scoped.display_id if scoped else "Last 7 days", "scope": f"{scoped.display_id} · {scoped.name}" if scoped else "All projects", "weekDelta": round(rate1 - rate0, 1) if ex0 else 0.0}}


async def _loop(s: AsyncSession, now: datetime, scoped: Run | None = None) -> dict:
    """Today's rings (UTC day), or one run's: plan = cases in plans approved / created; prove = failures confirmed /
    found; decide = approvals decided / opened."""
    if scoped:
        plan = await s.get(Plan, scoped.plan_id)
        plans = [plan] if plan else []
        found = (await s.scalars(select(Finding).where(Finding.run_id == scoped.id))).all()
        opened = (await s.scalars(select(Approval).where(Approval.subject_id == scoped.id))).all()
    else:
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
async def analytics(run: str | None = None, s: AsyncSession = Depends(session)):
    scoped = await _scope(s, run)
    findings = (await s.scalars(select(Finding).where(Finding.run_id == scoped.id) if scoped else select(Finding))).all()
    repairs = (await s.scalars(select(Repair).where(Repair.finding_id.in_([f.id for f in findings])) if scoped else select(Repair))).all()
    calls = (await s.scalars(select(ModelCall).where(ModelCall.run_id == scoped.id) if scoped else select(ModelCall))).all()
    dq = select(PolicyDecision).where(PolicyDecision.allow.is_(False))
    denials = len((await s.scalars(dq.where(PolicyDecision.subject_id == scoped.id) if scoped else dq)).all())

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
            "totalCostUsd": round(sum(c.cost_usd or 0.0 for c in calls), 6), "policyDenials": denials,
            "byType": [{"type": t, "label": LABELS.get(t, t), "count": n} for t, n in
                       sorted(Counter(f.category or "ui" for f in findings).items(), key=lambda x: -x[1])],
            "passRate30": await _pass_rate(s, 30, scoped), "flaky": await _flaky(s, scoped=scoped),
            "evidence": await _evidence(s, findings, scoped=scoped), "diagnoses": await _diagnoses(s, scoped),
            "scope": {"run": scoped.display_id, "uuid": scoped.id, "name": scoped.name} if scoped else None}


async def _pass_rate(s: AsyncSession, days: int, scoped: Run | None = None) -> list[dict]:
    """Daily pass rate over verified cases; null on days without runs (the chart leaves a gap, not a zero)."""
    now = datetime.now(UTC)
    runs = [scoped] if scoped else (await s.scalars(select(Run).where(Run.started_at >= now - timedelta(days=days)))).all()
    out = []
    for i in range(days):
        d = (now - timedelta(days=days - 1 - i)).date()
        p, f, n = _tally([r for r in runs if _aware(r.started_at).date() == d], datetime.min.replace(tzinfo=UTC), now + timedelta(days=1))
        out.append({"date": d.isoformat(), "rate": round(100 * p / (p + f + n), 1) if p + f + n else None})
    return out


async def _flaky(s: AsyncSession, window: int = 10, scoped: Run | None = None) -> list[dict]:
    """Cases that both passed and failed across their last `window` runs. Rate = the rarer outcome's share.
    Scoped to a run: only that run's cases, judged on their history across all runs."""
    evs = (await s.scalars(select(RunEvent).where(RunEvent.event_type == "verdict").order_by(RunEvent.ts))).all()
    if scoped:
        mine = {m.group(1) for e in evs if e.run_id == scoped.id and (m := _CASE_RE.match(e.summary or ""))}
        evs = [e for e in evs if (m := _CASE_RE.match(e.summary or "")) and m.group(1) in mine]
    per: dict[str, list[str]] = defaultdict(list)
    for e in evs:
        m = _CASE_RE.match(e.summary or "")
        if m and e.status in _STATUS_OUTCOME and not m.group(1).startswith("PASSIVE-"):
            per[m.group(1)].append(_STATUS_OUTCOME[e.status])
    rows = []
    for case, outs in per.items():
        last = outs[-window:]
        passed, failed = last.count("passed"), sum(1 for o in last if o != "passed")
        if passed and failed:
            rows.append({"case": case, "rate": round(100 * min(passed, failed) / len(last), 1), "passed": passed, "failed": failed})
    return sorted(rows, key=lambda r: -r["rate"])[:8]


async def _evidence(s: AsyncSession, findings: list[Finding], top: int = 5, scoped: Run | None = None) -> dict:
    """Claim → evidence network: the newest proven or uncertain findings and the evidence kinds behind each."""
    picked = sorted([f for f in findings if f.status in ("confirmed", "needs_review") and f.evidence_ids],
                    key=lambda f: _aware(f.created_at), reverse=True)[:top]
    ids = [i for f in picked for i in f.evidence_ids]
    kind = {e.id: e.kind for e in (await s.scalars(select(Evidence).where(Evidence.id.in_(ids)))).all()} if ids else {}
    all_kinds = Counter(e.kind for e in (await s.scalars(select(Evidence).where(Evidence.run_id == scoped.id) if scoped else select(Evidence))).all())
    return {"findings": [{"id": f.display_id, "title": f.title, "status": f.status, "severity": f.severity,
                          "kinds": dict(Counter(kind[i] for i in f.evidence_ids if i in kind))} for f in picked],
            "kinds": dict(all_kinds.most_common(6)),
            "backed": sum(1 for f in findings if f.status == "confirmed"),
            "uncertain": sum(1 for f in findings if f.status in ("needs_review", "inconclusive"))}


async def _diagnoses(s: AsyncSession, scoped: Run | None = None) -> dict:
    q = select(RunEvent).where(RunEvent.event_type == "diagnosis")
    evs = (await s.scalars(q.where(RunEvent.run_id == scoped.id) if scoped else q)).all()
    return {"total": len(evs), "ai": sum(1 for e in evs if e.actor == "ai")}


async def _read_network(uri: str) -> list[dict]:
    if not uri:
        return []
    try:
        if uri.startswith("s3://"):
            if not storage.s3_enabled():
                return []
            bucket, key = storage._split(uri)
            response = await asyncio.to_thread(storage._client().get_object, Bucket=bucket, Key=key)
            data = json.loads(await asyncio.to_thread(response["Body"].read))
        else:
            data = json.loads(Path(uri).read_text(encoding="utf-8"))
    except Exception:  # evidence may have expired or the remote object store may be unavailable
        return []
    return [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []


async def _read_har(uri: str) -> list[dict]:
    """Use HAR timings and status when available; the runner removes headers and bodies."""
    if not uri:
        return []
    try:
        if uri.startswith("s3://"):
            if not storage.s3_enabled():
                return []
            bucket, key = storage._split(uri)
            response = await asyncio.to_thread(storage._client().get_object, Bucket=bucket, Key=key)
            data = json.loads(await asyncio.to_thread(response["Body"].read))
        else:
            data = json.loads(Path(uri).read_text(encoding="utf-8"))
        entries = data["log"]["entries"]
        first = datetime.fromisoformat(entries[0]["startedDateTime"].replace("Z", "+00:00")) if entries else None
        rows = []
        from urllib.parse import urlparse
        for entry in entries:
            request, response = entry.get("request", {}), entry.get("response", {})
            started = datetime.fromisoformat(entry["startedDateTime"].replace("Z", "+00:00"))
            url = str(request.get("url") or "")
            rows.append({"t": int((started - first).total_seconds() * 1000) if first else 0,
                         "ms": round(entry["time"]), "method": request.get("method", "GET"),
                         "path": urlparse(url).path or "/", "url": url,
                         "status": response.get("status")})
        return rows
    except (OSError, ValueError, TypeError, KeyError, IndexError):
        return []


@router.get("/api/insights/network")
async def network(run: str | None = None, case: str | None = None, s: AsyncSession = Depends(session)):
    scoped = await _scope(s, run)
    q = select(Evidence).join(Run, Run.id == Evidence.run_id).where(Evidence.kind.in_(["network", "har", "trace"])).order_by(Run.started_at)
    evs = (await s.scalars(q.where(Evidence.run_id == scoped.id) if scoped else q)).all()
    cases = sorted({e.test_case_id for e in evs})
    artifacts = [{"case": cid, "har": next((f"/api/evidence/{e.id}" for e in evs if e.test_case_id == cid and e.kind == "har"), None),
                  "trace": next((f"/api/evidence/{e.id}" for e in evs if e.test_case_id == cid and e.kind == "trace"), None)}
                 for cid in cases]
    if case:
        evs = [e for e in evs if e.test_case_id == case]
        artifacts = [row for row in artifacts if row["case"] == case]
    grouped: dict[tuple[str, str], list[Evidence]] = defaultdict(list)
    for ev in evs:
        if ev.kind in {"har", "network"}:
            grouped[(ev.run_id, ev.test_case_id)].append(ev)
    stats: dict[tuple[str, str], dict] = {}
    times: dict[tuple[str, str], list[int]] = defaultdict(list)
    codes: Counter = Counter()
    files, waterfall = 0, None
    for group in grouped.values():
        ev, reqs = None, []
        for candidate in sorted(group, key=lambda item: item.kind != "har"):
            parsed = await (_read_har(candidate.uri) if candidate.kind == "har" else _read_network(candidate.uri))
            if parsed:
                ev, reqs = candidate, parsed
                break
        if not reqs:
            continue
        files += 1
        waterfall = {"case": ev.test_case_id, "requests": [  # the newest file wins: one case's requests on a time axis
            {k: r.get(k) for k in ("t", "ms", "method", "path", "status")} for r in sorted(reqs, key=lambda r: r.get("t") or 0)][:60]}
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
            codes[f"{st // 100}xx" if isinstance(st, int) else "no response"] += 1
            if isinstance(r.get("ms"), int):
                times[key].append(r["ms"])
            t = r.get("t")
            if method == "POST" and isinstance(t, (int, float)):
                if key in last and t - last[key] <= DUP_WINDOW_MS:
                    row["duplicatePosts"] += 1
                last[key] = t
    for key, row in stats.items():
        ms = sorted(times.get(key, []))
        row["p50"], row["p95"] = (ms[len(ms) // 2], ms[min(len(ms) - 1, int(len(ms) * 0.95))]) if ms else (None, None)
    endpoints = sorted(stats.values(), key=lambda r: (-r["requests"], r["method"], r["path"]))
    return {"files": files, "cases": cases, "selectedCase": case, "artifacts": artifacts,
            "endpoints": endpoints, "statusCodes": dict(sorted(codes.items())), "waterfall": waterfall,
            "scope": {"run": scoped.display_id, "uuid": scoped.id, "name": scoped.name} if scoped else None,
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
