"""Workspace event stream (PLAN_MODES §5): every change a page shows (run state, findings, approvals, plans, repairs)
is written to `workspace_events` and announced on a doorbell (Redis channel `workspace`, or in-process queues).
Pages subscribe once per tab and refetch what changed. Also serves the run graph map (`/api/runs/{id}/graph`)."""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from trevyn_orch.graph import TOPOLOGY

from . import runs
from .common import get_or_404
from .db import Plan, Run, RunEvent, Session, WorkspaceEvent, session

log = logging.getLogger("trevyn.events")
router = APIRouter()
_local: set[asyncio.Queue] = set()


async def publish(project_id: str | None, type_: str, payload: dict) -> None:
    """Never raises: a missed live update must not break the action that caused it (pages also poll as a fallback)."""
    try:
        async with Session() as s:
            ev = WorkspaceEvent(project_id=project_id, type=type_, payload=payload)
            s.add(ev)
            await s.commit()
            bell = {"id": ev.id, "type": type_}
        if runs.redis_url():
            await runs.redis().publish("workspace", json.dumps(bell))
        for q in list(_local):
            q.put_nowait(bell)
    except Exception:
        log.exception("workspace event %s not published", type_)


async def _bells() -> AsyncIterator[dict]:
    if runs.redis_url():
        ps = runs.redis().pubsub()
        await ps.subscribe("workspace")
        try:
            async for m in ps.listen():
                if m.get("type") == "message":
                    yield json.loads(m["data"])
        finally:
            await ps.unsubscribe("workspace")
            await ps.aclose()
    else:
        q: asyncio.Queue = asyncio.Queue()
        _local.add(q)
        try:
            while True:
                yield await q.get()
        finally:
            _local.discard(q)


def ev_json(e: WorkspaceEvent) -> dict:
    return {"id": e.id, "project_id": e.project_id, "type": e.type, "payload": e.payload, "ts": e.ts.isoformat()}


async def _after(after_id: int, project: str | None, limit: int = 200) -> list[WorkspaceEvent]:
    async with Session() as s:
        q = select(WorkspaceEvent).where(WorkspaceEvent.id > after_id).order_by(WorkspaceEvent.id).limit(limit)
        if project:
            q = q.where(WorkspaceEvent.project_id == project)
        return list((await s.scalars(q)).all())


@router.get("/api/events")
async def list_events(after_id: int = 0, project: str | None = None, limit: int = 200, latest: int = 0):
    """Oldest first after `after_id` (catch-up), or with `latest=N` the newest N, newest first (notifications)."""
    if latest:
        async with Session() as s:
            q = select(WorkspaceEvent).order_by(WorkspaceEvent.id.desc()).limit(min(latest, 100))
            if project:
                q = q.where(WorkspaceEvent.project_id == project)
            return {"items": [ev_json(e) for e in (await s.scalars(q)).all()]}
    return {"items": [ev_json(e) for e in await _after(after_id, project, min(limit, 500))]}


@router.get("/api/events/stream")
async def stream(request: Request, after_id: int = 0, project: str | None = None):
    last = int(request.headers.get("last-event-id") or after_id or 0)
    if not last:  # a fresh tab only needs what happens from now on
        async with Session() as s:
            last = await s.scalar(select(WorkspaceEvent.id).order_by(WorkspaceEvent.id.desc()).limit(1)) or 0

    async def gen():
        bells = _bells()
        bell = asyncio.ensure_future(anext(bells))
        seen = last
        try:
            while True:
                for e in await _after(seen, project):
                    seen = e.id
                    yield {"id": str(e.id), "event": "workspace", "data": json.dumps(ev_json(e))}
                done, _ = await asyncio.wait({bell}, timeout=5)  # re-read on every bell, or every 5 s regardless
                if done:
                    bell = asyncio.ensure_future(anext(bells))
        finally:
            bell.cancel()
            await bells.aclose()

    return EventSourceResponse(gen(), ping=15)


def _applies(item: dict, mode: str) -> bool:
    return mode in item.get("modes", [mode])


@router.get("/api/runs/{run_id}/graph")
async def run_graph(run_id: str, s: AsyncSession = Depends(session)):
    """Topology for the run's mode plus each node's latest phase and each lane's progress, for the first paint of the
    live graph map. Live `node` / `lane` events update it afterwards."""
    run = await get_or_404(s, Run, run_id)
    plan = await s.get(Plan, run.plan_id)
    mode = plan.test_mode if plan else "black_box"
    status: dict[str, str] = {}
    lanes: dict[str, dict] = {}
    rows = (await s.scalars(select(RunEvent).where(RunEvent.run_id == run.id, RunEvent.event_type.in_(["node", "lane"]))
                            .order_by(RunEvent.seq))).all()
    for e in rows:
        d = e.data or {}
        if e.event_type == "node" and d.get("node"):
            status[d["node"]] = {"start": "running", "end": "done", "waiting": "waiting", "failed": "failed"}.get(d.get("phase"), "running")
        elif e.event_type == "lane" and d.get("lane"):
            lanes[d["lane"]] = {"done": d.get("done", 0), "total": d.get("total", 0), "status": e.status, "note": d.get("note", "")}
    topo = []
    for n in TOPOLOGY:
        item = {k: v for k, v in n.items() if k not in ("children", "lanes")}
        item["status"] = status.get(n["id"], "pending")
        if "children" in n:
            item["children"] = [{**c, "status": status.get(c["id"], "pending")} for c in n["children"] if _applies(c, mode)]
            kids = [c["status"] for c in item["children"]]
            item["status"] = ("failed" if "failed" in kids else "running" if "running" in kids else
                              "done" if kids and all(k == "done" for k in kids) else item["status"])
        if "lanes" in n:
            item["lanes"] = [{**ln, "status": status.get(ln["id"], "pending"), "progress": lanes.get(ln["lane"])} for ln in n["lanes"]]
            ls = [ln["status"] for ln in item["lanes"]]
            item["status"] = ("running" if "running" in ls else "done" if all(x == "done" for x in ls) else
                              "failed" if "failed" in ls else "pending")
        topo.append(item)
    if run.state == "AWAITING_APPROVAL":
        next(n for n in topo if n["id"] == "gate")["status"] = "waiting"
    return {"run": run.display_id, "state": run.state, "mode": mode, "nodes": topo}
