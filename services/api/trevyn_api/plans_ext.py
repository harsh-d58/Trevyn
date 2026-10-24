"""Plan lifecycle (blueprint Step 5): list, edit-as-new-version, diff. Existing versions are never edited."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from trevyn_contracts import PlanDraft, SiteMap, TestCase
from trevyn_orch import planner

from . import runs
from .common import Problem, get_or_404
from .db import Environment, Plan, Project, Run, SiteMapRecord, session

router = APIRouter()


def summary(p: Plan) -> dict:
    return {"id": p.id, "version": p.version, "parent_plan_id": p.parent_plan_id, "status": p.status, "source": p.source,
            "requirement": p.requirement, "risk_level": p.risk_level, "cases": len(p.test_cases), "created_at": p.created_at.isoformat()}


@router.get("/api/plans")
async def list_plans(project: str | None = None, status: str | None = None, s: AsyncSession = Depends(session)):
    q = select(Plan).order_by(Plan.created_at.desc())
    if project:
        q = q.where(Plan.project_id == project)
    if status:
        q = q.where(Plan.status == status)
    return {"items": [summary(p) for p in (await s.scalars(q)).all()]}


class PlanEdit(BaseModel):
    test_cases: list[dict]


@router.patch("/api/plans/{plan_id}", status_code=201)
async def edit_plan(plan_id: str, body: PlanEdit, s: AsyncSession = Depends(session)):
    old = await get_or_404(s, Plan, plan_id)
    proj = await s.get(Project, old.project_id)
    errors: list[str] = []
    cases: list[TestCase] = []
    for i, raw in enumerate(body.test_cases):
        try:
            cases.append(TestCase.model_validate(raw))
        except ValidationError as e:
            errors += [f"case {i + 1}: {'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors()]
    env = await s.get(Environment, old.environment_id)
    snapshot = await s.get(SiteMapRecord, old.site_map_id) if old.site_map_id else None
    if not errors:
        errors = planner.validate(PlanDraft(test_cases=cases), proj.allowed_domains,
                                  site_map=SiteMap.model_validate(snapshot.content) if snapshot else None,
                                  has_hook=bool(env.hook_url))
    if errors:
        raise Problem(422, "validation_error", "; ".join(errors[:8]))
    latest = max((p.version for p in (await s.scalars(select(Plan).where(Plan.project_id == old.project_id, Plan.requirement == old.requirement))).all()), default=old.version)
    new = Plan(project_id=old.project_id, environment_id=old.environment_id, requirement=old.requirement, test_mode=old.test_mode, source="edited",
               site_map_id=old.site_map_id,
               version=latest + 1, parent_plan_id=old.id, status="candidate", stack_hypotheses=old.stack_hypotheses,
               risk_level=max((c.risk for c in cases), key=["low", "medium", "high"].index),
               test_cases=[c.model_dump(exclude_none=True) for c in cases])
    s.add(new)
    await s.commit()
    await runs.audit("user", "plan.edit", "plan", new.id, parent=old.id, version=new.version)
    return summary(new) | {"test_cases": new.test_cases}


@router.get("/api/plans/{plan_id}/diff")
async def diff_plans(plan_id: str, against: str, s: AsyncSession = Depends(session)):
    a, b = await get_or_404(s, Plan, against), await get_or_404(s, Plan, plan_id)
    ia, ib = {c["test_case_id"]: c for c in a.test_cases}, {c["test_case_id"]: c for c in b.test_cases}
    return {"from_version": a.version, "to_version": b.version, "added": sorted(ib.keys() - ia.keys()), "removed": sorted(ia.keys() - ib.keys()),
            "changed": sorted(k for k in ia.keys() & ib.keys() if ia[k] != ib[k])}


@router.get("/api/plans/{plan_id}/runs")
async def plan_runs(plan_id: str, s: AsyncSession = Depends(session)):
    p = await get_or_404(s, Plan, plan_id)
    return {"items": [{"id": r.display_id, "state": r.state, "trigger": r.trigger} for r in (await s.scalars(select(Run).where(Run.plan_id == p.id))).all()]}
