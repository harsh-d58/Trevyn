"""Integrations (Step 11): GitHub PR webhook -> CI run, Slack notify, Jira issue from a finding, status."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import runs, storage
from .common import Problem, get_or_404
from .db import Finding, Plan, Project, session

router = APIRouter()
JIRA_VARS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY")


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[7:])


@router.post("/api/webhooks/github")
async def github_webhook(request: Request, s: AsyncSession = Depends(session)):
    secret = os.getenv("GITHUB_WEBHOOK_SECRET")
    if not secret:
        raise Problem(503, "integration_unavailable", "GITHUB_WEBHOOK_SECRET is not set")
    body = await request.body()  # verify before parsing anything
    if not verify_signature(secret, body, request.headers.get("x-hub-signature-256")):
        raise Problem(401, "invalid_signature", "Missing or invalid X-Hub-Signature-256")
    event = request.headers.get("x-github-event", "")
    payload = json.loads(body or b"{}")
    if event != "pull_request" or payload.get("action") not in ("opened", "synchronize"):
        return JSONResponse({"ignored": True, "event": event, "action": payload.get("action")}, status_code=202)
    full_name = (payload.get("repository") or {}).get("full_name", "")
    proj = await s.scalar(select(Project).where(Project.repository_url == f"https://github.com/{full_name}")) if full_name else None
    if not proj:
        raise Problem(404, "not_found", "No project is connected to this GitHub repository")
    plan = await s.scalar(select(Plan).where(Plan.project_id == proj.id, Plan.status == "approved")
                          .order_by(Plan.created_at.desc()).limit(1))
    if not plan:
        raise Problem(409, "conflict", "No approved plan to run for this project")
    pr = payload.get("pull_request") or {}
    from .main import create_run, run_json  # late import: main imports this module
    run = await create_run(s, plan, name=f"PR #{pr.get('number', '?')}: {pr.get('title', '')}"[:200],
                           idempotency_key=f"gh-{pr.get('number')}-{(pr.get('head') or {}).get('sha', '')}"[:100],
                           trigger="ci", actor="github")
    return {"run": run_json(run)}


async def notify(text: str) -> bool:
    """Post to Slack's incoming webhook if SLACK_WEBHOOK_URL is set; never raises."""
    if not (url := os.getenv("SLACK_WEBHOOK_URL")):
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            return (await c.post(url, json={"text": text})).is_success
    except httpx.HTTPError:
        return False


def _adf(f: Finding) -> dict:
    para = lambda txt: {"type": "paragraph", "content": [{"type": "text", "text": txt or "-"}]}
    head = lambda txt: {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": txt}]}
    steps = [{"type": "listItem", "content": [para(str(st if isinstance(st, str) else json.dumps(st)))]} for st in f.repro_steps or []]
    return {"type": "doc", "version": 1, "content": [
        head("Expected"), para(f.expected), head("Actual"), para(f.actual), head("Steps to reproduce"),
        {"type": "orderedList", "content": steps} if steps else para("-"),
        para(f"Trevyn finding {f.display_id} · severity {f.severity} · status {f.status}")]}


@router.post("/api/findings/{fid}/jira", status_code=201)
async def create_jira_issue(fid: str, s: AsyncSession = Depends(session)):
    if not all(os.getenv(k) for k in JIRA_VARS):
        raise Problem(503, "integration_unavailable", "Jira is not configured")
    f = await get_or_404(s, Finding, fid)
    auth = base64.b64encode(f"{os.environ['JIRA_EMAIL']}:{os.environ['JIRA_API_TOKEN']}".encode()).decode()
    body = {"fields": {"project": {"key": os.environ["JIRA_PROJECT_KEY"]}, "issuetype": {"name": "Bug"},
                       "summary": f"[{f.display_id}] {f.title}"[:255], "description": _adf(f),
                       "labels": ["trevyn", f"severity-{f.severity}"]}}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(os.environ["JIRA_BASE_URL"].rstrip("/") + "/rest/api/3/issue", json=body,
                             headers={"Authorization": f"Basic {auth}", "Accept": "application/json"})
    except httpx.HTTPError as e:
        raise Problem(502, "integration_error", f"Jira unreachable: {e}") from e
    if not r.is_success:
        raise Problem(502, "integration_error", f"Jira returned {r.status_code}")
    key = r.json().get("key")
    await runs.audit("user", "finding.jira", "finding", f.id, issue_key=key)
    return {"key": key, "url": os.environ["JIRA_BASE_URL"].rstrip("/") + f"/browse/{key}"}


@router.get("/api/integrations")
async def integrations_status():
    return {"github": bool(os.getenv("GITHUB_WEBHOOK_SECRET")), "slack": bool(os.getenv("SLACK_WEBHOOK_URL")),
            "jira": all(os.getenv(k) for k in JIRA_VARS), "s3": storage.s3_enabled(), "opa": bool(os.getenv("OPA_URL"))}
