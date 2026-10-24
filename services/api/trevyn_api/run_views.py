"""Read-only, run-scoped projections for the workspace. Missing measurements stay missing."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .common import Problem
from .auth import ORDER
from .db import (Approval, Environment, Evidence, Finding, ModelCall, Plan, PolicyDecision,
                 Project, RegressionResult, Repair, Run, RunEvent, SiteMapRecord, session)
from . import storage

router = APIRouter()


async def _json_evidence(ev: Evidence) -> object | None:
    if not ev.uri:
        return None
    try:
        if ev.uri.startswith("s3://"):
            if not storage.s3_enabled():
                return None
            bucket, key = storage._split(ev.uri)
            obj = await asyncio.to_thread(storage._client().get_object, Bucket=bucket, Key=key)
            raw = await asyncio.to_thread(obj["Body"].read)
            return json.loads(raw)
        return json.loads(Path(ev.uri).read_text(encoding="utf-8"))
    except Exception:  # expired local object or remote object-store read failure: show an honest empty state
        return None


async def load_run_bundle(s: AsyncSession, run_id: str) -> dict:
    run = await s.get(Run, run_id) or await s.scalar(select(Run).where(Run.display_id == run_id))
    if not run:
        raise Problem(404, "not_found", f"Run {run_id} not found")
    plan = await s.get(Plan, run.plan_id)
    site = await s.get(SiteMapRecord, plan.site_map_id) if plan and plan.site_map_id else None
    evs = (await s.scalars(select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.seq))).all()
    evidence = (await s.scalars(select(Evidence).where(Evidence.run_id == run.id))).all()
    findings = (await s.scalars(select(Finding).where(Finding.run_id == run.id))).all()
    repairs = (await s.scalars(select(Repair).where(Repair.finding_id.in_([f.id for f in findings])))).all() if findings else []
    related_ids = [run.id, plan.id if plan else run.id, *[f.id for f in findings], *[r.id for r in repairs]]
    approvals = (await s.scalars(select(Approval).where(Approval.subject_id.in_(related_ids)))).all()
    calls = (await s.scalars(select(ModelCall).where(ModelCall.run_id == run.id))).all()
    policies = (await s.scalars(select(PolicyDecision).where(PolicyDecision.subject_id.in_(related_ids)))).all()
    regressions = (await s.scalars(select(RegressionResult).where(RegressionResult.regression_run_id == run.id))).all()
    project = await s.get(Project, run.project_id)
    environment = await s.get(Environment, run.environment_id)
    return locals()


def _run(b: dict) -> dict:
    r = b["run"]
    return {"id": r.id, "display_id": r.display_id, "project_id": r.project_id, "name": r.name,
            "state": r.state, "counts": r.counts or {}, "started_at": r.started_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None, "trigger": r.trigger}


def _case_id(e: RunEvent) -> str | None:
    return (e.data or {}).get("test_case_id") or (e.summary or "").split(" · ")[0].split(" → ")[0].split(":")[0].strip() or None


def _evidence(e: Evidence) -> dict:
    return {"id": e.id, "case": e.test_case_id, "kind": e.kind, "bytes": e.bytes, "url": f"/api/evidence/{e.id}" if e.uri else None}


def _events(b: dict, kind: str) -> list[dict]:
    return [{"seq": e.seq, "case": _case_id(e), "summary": e.summary, "status": e.status,
             "data": e.data or {}, "evidence_refs": e.evidence_refs or []} for e in b["evs"] if e.event_type == kind]


def _plan(b: dict) -> dict:
    p = b["plan"]
    if not p:
        return {"run": _run(b), "plan": None, "reason": "This run has no saved plan."}
    return {"run": _run(b), "plan": {"id": p.id, "version": p.version, "status": p.status,
            "source": p.source, "mode": p.test_mode, "requirement": p.requirement,
            "risk_level": p.risk_level, "created_at": p.created_at.isoformat(),
            "parent_plan_id": p.parent_plan_id, "test_cases": p.test_cases or []}}


async def _repository_scan(b: dict) -> dict:
    evidence_by_id = {e.id: e for e in b["evidence"]}
    findings = []
    for finding in b["findings"]:
        rule = (finding.verdict or {}).get("rule", "")
        if not rule.startswith(("osv:", "gitleaks:")):
            continue
        detail = {}
        for eid in finding.evidence_ids or []:
            ev = evidence_by_id.get(eid)
            if ev and ev.kind == "passive_check":
                detail = await _json_evidence(ev) or {}
                break
        findings.append({"id": finding.display_id, "rule": rule, "severity": finding.severity,
                         "name": finding.title, "package": detail.get("package"), "version": detail.get("version"),
                         "aliases": detail.get("aliases"), "fixed_version": detail.get("fixed_version"),
                         "file": detail.get("file"), "line": detail.get("line"),
                         "evidence": [f"/api/evidence/{eid}" for eid in finding.evidence_ids or []]})
    scanned = [e.kind for e in b["evidence"] if e.kind in {"osv_report", "gitleaks_report"}]
    return {"status": "not run" if not scanned else "issues found" if findings else "passed",
            "osv": "measured" if "osv_report" in scanned else "not run",
            "gitleaks": "measured" if "gitleaks_report" in scanned else "not run",
            "findings": findings}


async def _traffic(b: dict) -> list[dict]:
    rows = []
    for ev in b["evidence"]:
        if ev.kind != "network":
            continue
        data = await _json_evidence(ev)
        if isinstance(data, list):
            rows.extend({**r, "case": ev.test_case_id} for r in data if isinstance(r, dict))
    return rows


@router.get("/api/runs/{run_id}/plan")
async def run_plan(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    current = _plan(b)
    plan = b["plan"]
    parent = await s.get(Plan, plan.parent_plan_id) if plan and plan.parent_plan_id else None
    before = {c["test_case_id"]: c for c in (parent.test_cases or [])} if parent else {}
    after = {c["test_case_id"]: c for c in (plan.test_cases or [])} if plan else {}
    return {**current, "diff": {"previous_version": parent.version if parent else None,
                                "added": sorted(after.keys() - before.keys()) if parent else [],
                                "removed": sorted(before.keys() - after.keys()) if parent else [],
                                "changed": sorted(k for k in before.keys() & after.keys() if before[k] != after[k])}}


@router.get("/api/runs/{run_id}/planner")
async def planner(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    return {**_plan(b), "site_map": b["site"].content if b["site"] else None,
            "repository_map": b["plan"].repository_map if b["plan"] else None,
            "repository_scan": await _repository_scan(b),
            "model_calls": [{"node": c.node, "model": c.model, "cost_usd": c.cost_usd,
                             "input_tokens": c.input_tokens, "output_tokens": c.output_tokens} for c in b["calls"]]}


@router.get("/api/runs/{run_id}/ui")
async def ui(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    accessibility = [{"case": e.test_case_id, "path": page.get("path"),
                      "rule": item.get("id"), "impact": item.get("impact"), "name": item.get("help"),
                      "help_url": item.get("helpUrl"), "wcag": [tag for tag in item.get("tags", []) if str(tag).startswith("wcag")],
                      "nodes": item.get("nodes"), "evidence": f"/api/evidence/{e.id}"}
                     for e in b["evidence"] if e.kind == "axe"
                     for page in (await _json_evidence(e) or []) if isinstance(page, dict)
                     for item in page.get("violations", []) if isinstance(item, dict)]
    return {"run": _run(b), "cases": b["plan"].test_cases if b["plan"] else [],
            "steps": _events(b, "step"), "assertions": _events(b, "assertion"), "verdicts": _events(b, "verdict"),
            "screenshots": [_evidence(e) for e in b["evidence"] if e.kind == "screenshot"],
            "traces": [_evidence(e) for e in b["evidence"] if e.kind == "trace"],
            "console": [{"case": e.test_case_id, "messages": await _json_evidence(e)} for e in b["evidence"] if e.kind == "console"],
            "accessibility": accessibility}


@router.get("/api/runs/{run_id}/api-calls")
async def api_calls(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    host = urlparse(b["environment"].base_url).hostname if b["environment"] else None
    rows = [r for r in await _traffic(b) if r.get("resourceType") in ("xhr", "fetch")
            and urlparse(str(r.get("url") or "")).hostname == host]  # every data call the app makes, not only /api/*
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        groups[(str(row.get("method") or "GET"), str(row.get("path") or ""))].append(row)
    endpoints = []
    for (method, path), group in sorted(groups.items()):
        timings = sorted(r["ms"] for r in group if isinstance(r.get("ms"), (int, float)))
        endpoints.append({"method": method, "path": path, "requests": len(group),
                          "errors": sum(1 for r in group if (r.get("status") or 0) >= 400),
                          "p50_ms": timings[len(timings) // 2] if timings else None,
                          "p95_ms": timings[min(len(timings) - 1, int(len(timings) * .95))] if timings else None})
    return {"run": _run(b), "calls": rows, "endpoints": endpoints, "contract_tests": "not run",
            "reason": None if rows else "The app made no XHR or fetch calls to its own host during this run."}


@router.get("/api/runs/{run_id}/perf")
async def perf(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    traffic = await _traffic(b)
    steps = _events(b, "step")
    lighthouse = []
    lighthouse_metrics = []
    lighthouse_opportunities = []
    for ev in b["evidence"]:
        if ev.kind != "lighthouse_summary":
            continue
        item = await _json_evidence(ev)
        if not isinstance(item, dict):
            continue
        lighthouse.append({"page": item.get("page"), "score": item.get("score"),
                           "evidence": f"/api/evidence/{ev.id}"})
        lighthouse_metrics.extend({"page": item.get("page"), "metric": name, **metric}
                                  for name, metric in item.get("metrics", {}).items() if isinstance(metric, dict))
        lighthouse_opportunities.extend({"page": item.get("page"), **opportunity}
                                        for opportunity in item.get("opportunities", []) if isinstance(opportunity, dict))
    vitals = []
    for ev in b["evidence"]:
        if ev.kind != "web_vitals":
            continue
        data = await _json_evidence(ev)
        if not isinstance(data, list):
            continue
        for page in data:
            if not isinstance(page, dict):
                continue
            for name, budget in {"LCP": 2500, "CLS": 0.1, "INP": 200, "TTFB": 800}.items():
                value = (page.get("metrics") or {}).get(name, {}).get("value")
                vitals.append({"case": ev.test_case_id, "path": page.get("path"), "metric": name,
                               "value": round(value, 2) if isinstance(value, (int, float)) else None,
                               "budget": budget, "status": "not run" if not isinstance(value, (int, float)) else
                               "failed" if value > budget else "passed", "evidence": f"/api/evidence/{ev.id}"})
    return {"run": _run(b), "navigation": [e for e in steps if e["data"].get("navigation")],
            "lighthouse": lighthouse, "lighthouse_metrics": lighthouse_metrics,
            "lighthouse_opportunities": lighthouse_opportunities, "web_vitals": vitals,
            "slow_requests": sorted([r for r in traffic if isinstance(r.get("ms"), (int, float))],
                                    key=lambda r: -r["ms"])[:30],
            "journey_ms": {case: sum(e["data"].get("t_ms") or 0 for e in steps if e["case"] == case)
                           for case in sorted({e["case"] for e in steps if e["case"]})},
            "response_bytes": sum(r.get("responseBytes") or 0 for r in traffic)
            if any(isinstance(r.get("responseBytes"), int) for r in traffic) else None,
            "load_test": "not run"}


@router.get("/api/runs/{run_id}/security")
async def security(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    checks = [await _json_evidence(e) for e in b["evidence"] if e.kind == "passive_summary"]
    summaries = [item for item in checks if isinstance(item, dict)]
    summary = {"rules": {key: value for item in summaries for key, value in item.get("rules", {}).items()},
               "pages": [page for item in summaries for page in item.get("pages", [])],
               "cases": [case for item in summaries for case in item.get("cases", [])],
               "cookies": [cookie for item in summaries for cookie in item.get("cookies", [])]} if summaries else None
    failures = [{"id": f.display_id, "rule": (f.verdict or {}).get("rule"), "severity": f.severity,
                 "title": f.title, "evidence": f.evidence_ids or []} for f in b["findings"]
                if (f.verdict or {}).get("rule", "").startswith(("passive:", "zap:"))]
    evidence_by_id = {e.id: e for e in b["evidence"]}
    zap_alerts = []
    for finding in b["findings"]:
        rule = (finding.verdict or {}).get("rule", "")
        if not rule.startswith("zap:"):
            continue
        detail = None
        for eid in finding.evidence_ids or []:
            evidence = evidence_by_id.get(eid)
            if evidence and evidence.kind == "passive_check":
                detail = await _json_evidence(evidence)
                break
        detail = detail if isinstance(detail, dict) else {}
        zap_alerts.append({"id": finding.display_id, "rule": rule, "name": finding.title,
                           "severity": finding.severity, "confidence": detail.get("confidence"),
                           "cwe": detail.get("cwe"), "wasc": detail.get("wasc"),
                           "urls": detail.get("urls", []), "evidence": [f"/api/evidence/{eid}" for eid in finding.evidence_ids or []]})
    zap_report = next((e for e in b["evidence"] if e.kind == "zap_report"), None)
    zap_status = "not run" if not zap_report else "issues found" if zap_alerts else "passed"  # a scanner finding issues did not fail
    rules = [{"rule": rule, "status": status} for rule, status in sorted((summary or {}).get("rules", {}).items())]
    rules.append({"rule": "ZAP baseline", "status": zap_status})
    return {"run": _run(b), "summary": summary, "rules": rules, "failures": failures,
            "zap_status": zap_status, "zap_alerts": zap_alerts,
            "repository": await _repository_scan(b),
            "reason": None if summary else "Passed passive rules were not recorded for this run."}


@router.get("/api/runs/{run_id}/environment")
async def environment(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    rows = [(e.data or {}).get("environment") for e in b["evs"] if (e.data or {}).get("environment")]
    matrix = []
    for ev in b["evidence"]:
        if ev.kind != "compat_matrix":
            continue
        data = await _json_evidence(ev)
        if isinstance(data, dict):
            matrix.extend(row for row in data.get("rows", []) if isinstance(row, dict))
    accessibility = [{"case": ev.test_case_id, "path": page.get("path"), "rule": item.get("id"),
                      "impact": item.get("impact"), "name": item.get("help"), "help_url": item.get("helpUrl"),
                      "nodes": item.get("nodes")}
                     for ev in b["evidence"] if ev.kind == "axe"
                     for page in (await _json_evidence(ev) or []) if isinstance(page, dict)
                     for item in page.get("violations", []) if isinstance(item, dict)]
    return {"run": _run(b), "environment": rows[0] if rows else None,
            "other_browsers": "measured" if matrix else "not run", "matrix": matrix,
            "accessibility": accessibility,
            "reason": None if rows else "Browser and viewport were not recorded for this run."}


@router.get("/api/runs/{run_id}/repairs")
async def repairs(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    by_id = {f.id: f for f in b["findings"]}
    return {"run": _run(b), "repairs": [{"id": r.display_id, "finding": by_id[r.finding_id].display_id,
            "title": by_id[r.finding_id].title, "diagnosis": by_id[r.finding_id].diagnosis,
            "prompt": r.prompt, "patch": r.patch, "guard": r.guard, "approval_id": r.approval_id,
            "outcome": r.outcome, "regression_run_id": r.regression_run_id} for r in b["repairs"]]}


@router.get("/api/runs/{run_id}/regression")
async def regression(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    rows = b["regressions"]
    history = []
    if not rows:
        recent = (await s.scalars(select(Run).where(Run.project_id == b["run"].project_id)
                                  .order_by(Run.started_at.desc()).limit(20))).all()
        ids = [r.id for r in recent]
        if ids:
            events = (await s.scalars(select(RunEvent).where(RunEvent.run_id.in_(ids), RunEvent.event_type == "verdict"))).all()
            names = {r.id: r.display_id for r in recent}
            case_ids = {c["test_case_id"] for c in (b["plan"].test_cases or [])} if b["plan"] else set()
            history = [{"run": names[e.run_id], "case": _case_id(e), "outcome": e.status}
                       for e in events if _case_id(e) in case_ids]
    return {"run": _run(b), "comparison": [{"case": r.test_case_id, "baseline": r.baseline_outcome,
            "rerun": r.rerun_outcome, "change": r.change} for r in rows],
            "history": history,
            "reason": None if rows else "This run has no direct regression comparison; showing its cases across this project's recent runs."}


@router.get("/api/runs/{run_id}/policy")
async def policy(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    return {"run": _run(b), "decisions": [{"action": p.action, "allow": p.allow,
            "reasons": p.reasons, "obligations": p.obligations, "version": p.policy_version} for p in b["policies"]],
            "approvals": [{"title": a.title, "status": a.status, "risk": a.risk} for a in b["approvals"]],
            "allowed_domains": b["project"].allowed_domains if b["project"] else [],
            "workspace_roles": ORDER}


@router.get("/api/runs/{run_id}/usage")
async def usage(run_id: str, s: AsyncSession = Depends(session)):
    b = await load_run_bundle(s, run_id)
    return {"run": _run(b), "model_calls": [{"node": c.node, "provider": c.provider, "model": c.model,
            "cost_usd": c.cost_usd, "input_tokens": c.input_tokens, "output_tokens": c.output_tokens} for c in b["calls"]],
            "total_cost_usd": round(sum(c.cost_usd or 0 for c in b["calls"]), 6),
            "notifications": "not recorded"}
