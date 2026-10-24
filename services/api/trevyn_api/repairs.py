"""Repair and regression loop (blueprint Step 6): propose a patch, guard it, approve it, prove it with a regression run.
Without a connected repo only the demo shop can be patched (by switching off its planted-bug flag); other projects
stop at the repair prompt. The baseline run is never modified."""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from trevyn_contracts import Target, TestCase
from trevyn_orch import diff_guard, regression

from . import runs
from .common import Problem, get_or_404
from .db import Approval, Environment, Finding, Plan, Project, RegressionResult, Repair, Run, Session, now, session, uid

router = APIRouter()
MAX_ATTEMPTS = 3

# test case -> (planted bug flag, equivalent code change shown to the reviewer)
DEMO_PATCHES = {
    "CHECKOUT-014": ("dup_order", "demo_shop/app.py", "Honour the Idempotency-Key header and disable the button after the first click",
                     "--- a/demo_shop/app.py\n+++ b/demo_shop/app.py\n@@ def place_order(...):\n"
                     "-    cur = c.execute(\"INSERT INTO orders ...\")  # every request inserts\n"
                     "+    if idempotency_key:\n+        prev = c.execute(\"SELECT id FROM orders WHERE user_id=? AND idem_key=?\", ...).fetchone()\n"
                     "+        if prev:\n+            return {\"id\": prev[\"id\"], \"duplicate\": True}\n"),
    "AUTH-003": ("user_enum", "demo_shop/app.py", "Return one generic message for unknown user and wrong password",
                 "--- a/demo_shop/app.py\n+++ b/demo_shop/app.py\n@@ def login(...):\n"
                 "-        msg = \"User not found\" if not u else \"Wrong password\"\n+        msg = \"Email or password is incorrect\"\n"),
    "REG-002": ("email_validation", "demo_shop/app.py", "Require a dotted domain in the email pattern",
                "--- a/demo_shop/app.py\n+++ b/demo_shop/app.py\n@@ def register(...):\n"
                "-    pattern = r\"^[^@\\s]+@[^@\\s]+$\"\n+    pattern = r\"^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$\"\n"),
    "CART-011": ("negative_qty", "demo_shop/app.py", "Reject quantities below 1",
                 "--- a/demo_shop/app.py\n+++ b/demo_shop/app.py\n@@ def set_qty(...):\n"
                 "+    if qty < 1:\n+        raise HTTPException(422, \"Quantity must be at least 1\")\n"),
    "PROF-004": ("profile_persist", "demo_shop/app.py", "Persist the display name",
                 "--- a/demo_shop/app.py\n+++ b/demo_shop/app.py\n@@ def save_profile(...):\n"
                 "+    c.execute(\"UPDATE users SET name=? WHERE id=?\", (name, u[\"id\"]))\n"),
}
COLUMN = {"proposed": "approval", "approved": "regression", "rejected": "investigating", "verified": "verified", "failed": "investigating"}


def _hook_headers() -> dict:
    t = os.getenv("TREVYN_HOOK_TOKEN")
    return {"X-Trevyn-Token": t} if t else {}


async def _bugs(hook_url: str, remove: str | None = None) -> list[str]:
    async with httpx.AsyncClient(timeout=10) as c:
        cur = (await c.get(f"{hook_url}/health")).json()["bugs"]
        if remove is None:
            return cur
        r = await c.post(f"{hook_url}/bugs", json={"bugs": [b for b in cur if b != remove]}, headers=_hook_headers())
        r.raise_for_status()
        return r.json()["bugs"]


def repair_json(r: Repair, f: Finding, ap: Approval | None, rows: list[RegressionResult], run: Run | None) -> dict:
    counts: dict[str, int] = {}
    for x in rows:
        counts[x.change] = counts.get(x.change, 0) + 1
    return {"id": r.display_id, "uuid": r.id, "finding": f.display_id, "attempt": r.attempt, "kind": r.kind, "outcome": r.outcome,
            "note": r.note, "prompt": r.prompt, "patch": r.patch, "guard": r.guard, "requested_by": r.requested_by,
            "approval": {"id": ap.display_id, "uuid": ap.id, "status": ap.status} if ap else None,
            "regression_run": run.display_id if run else None, "regression_state": run.state if run else None,
            "comparison": [{"test_case_id": x.test_case_id, "baseline": x.baseline_outcome, "rerun": x.rerun_outcome, "change": x.change} for x in rows],
            "counts": counts, "created_at": r.created_at.isoformat()}


async def _load(s: AsyncSession, r: Repair) -> dict:
    f = await s.get(Finding, r.finding_id)
    ap = await s.get(Approval, r.approval_id) if r.approval_id else None
    run = await s.get(Run, r.regression_run_id) if r.regression_run_id else None
    rows = (await s.scalars(select(RegressionResult).where(RegressionResult.regression_run_id == r.regression_run_id))).all() if run else []
    return repair_json(r, f, ap, list(rows), run)


@router.post("/api/findings/{fid}/repair-proposals", status_code=201)
async def propose(fid: str, request: Request, s: AsyncSession = Depends(session)):
    f = await get_or_404(s, Finding, fid)
    if f.status != "confirmed":
        raise Problem(409, "conflict", "Only confirmed findings can be repaired")
    prior = (await s.scalars(select(Repair).where(Repair.finding_id == f.id).order_by(Repair.attempt))).all()
    if any(r.outcome in ("pending", "approved") for r in prior):
        raise Problem(409, "conflict", "A repair for this finding is already in progress")
    if any(r.outcome == "verified" for r in prior):
        raise Problem(409, "conflict", "This finding already has a verified repair")
    if len(prior) >= MAX_ATTEMPTS:
        raise Problem(409, "conflict", f"{MAX_ATTEMPTS} attempts used; the finding was escalated to a human owner")
    run = await s.get(Run, f.run_id)
    env = await s.get(Environment, run.environment_id)
    entry = DEMO_PATCHES.get(f.test_case_id)
    if not (entry and env.local_runner and env.hook_url):
        raise Problem(422, "repo_required", "No repository is connected to this project, so Trevyn cannot patch it. Use the repair prompt on the finding.")
    flag, path, summary, diff = entry
    guard = diff_guard.check(diff)
    if guard["refused"]:
        raise Problem(422, "policy_denied", "; ".join(x["message"] for x in guard["flags"] if x["level"] == "refuse"))
    user = getattr(request.state, "user", {"sub": "dev"})
    rp = Repair(id=uid(), display_id=f"RP-{await s.scalar(select(func.count()).select_from(Repair).where(Repair.project_id == f.project_id)) + 1}",
                project_id=f.project_id, finding_id=f.id, attempt=len(prior) + 1, kind="demo_flag", requested_by=user["sub"],
                prompt=f.repair_prompt or summary, guard=guard,
                patch={"flag": flag, "summary": summary, "diff": diff, "files": guard["files"],
                       "note": f"Applying switches off the planted-bug flag '{flag}' on the demo shop. The diff shows the equivalent code change."})
    ap = Approval(id=uid(), display_id=await runs.next_display(Approval, f.project_id, "AP", 1), project_id=f.project_id, subject_type="patch",
                  subject_id=rp.id, title=f"Patch {f.display_id}: {summary}", reason=f"Attempt {rp.attempt} of {MAX_ATTEMPTS}. Regression runs after approval.", risk="medium")
    s.add_all([rp, ap])
    rp.approval_id = ap.id
    f.board_column = COLUMN["proposed"]
    await s.commit()
    await runs.audit(user["sub"], "repair.propose", "repair", rp.id, finding=f.display_id, attempt=rp.attempt)
    return await _load(s, rp)


@router.get("/api/repairs")
async def list_repairs(finding: str | None = None, s: AsyncSession = Depends(session)):
    q = select(Repair).order_by(Repair.created_at.desc())
    if finding:
        f = await get_or_404(s, Finding, finding)
        q = q.where(Repair.finding_id == f.id)
    return {"items": [await _load(s, r) for r in (await s.scalars(q)).all()]}


@router.get("/api/repairs/{rid}")
async def get_repair(rid: str, s: AsyncSession = Depends(session)):
    return await _load(s, await get_or_404(s, Repair, rid))


async def check_can_decide(s: AsyncSession, a: Approval, user: dict) -> None:
    """Self-approval of a patch is denied once real identities exist (AUTH_MODE=supabase)."""
    if os.getenv("AUTH_MODE", "off") == "off":
        return
    r = await s.get(Repair, a.subject_id)
    if r and r.requested_by == user["sub"]:
        raise Problem(403, "permission_denied", "You cannot approve a patch you requested")


async def on_decision(s: AsyncSession, a: Approval, approve: bool) -> None:
    r = await s.get(Repair, a.subject_id)
    f = await s.get(Finding, r.finding_id)
    r.outcome = "approved" if approve else "rejected"
    f.board_column = COLUMN[r.outcome]
    await s.commit()
    if approve:
        runs.dispatch("regression", r.id)


@router.post("/api/repairs/{rid}/verify")
async def verify(rid: str, request: Request, s: AsyncSession = Depends(session)):
    """Approve the patch (same as approving its approval) and start the regression run."""
    r = await get_or_404(s, Repair, rid)
    a = await s.get(Approval, r.approval_id)
    if a.status != "pending":
        raise Problem(409, "conflict", f"Already {a.status}")
    user = getattr(request.state, "user", {"sub": "dev"})
    await check_can_decide(s, a, user)
    a.status, a.decided_by, a.decided_at = "approved", user["sub"], now()
    await s.commit()
    await on_decision(s, a, True)
    await runs.audit(user["sub"], "repair.approve", "repair", r.id)
    return await _load(s, r)


async def run_regression(repair_id: str) -> None:
    async with Session() as s:
        r = await s.get(Repair, repair_id)
        f = await s.get(Finding, r.finding_id)
        base = await s.get(Run, f.run_id)
        plan = await s.get(Plan, base.plan_id)
        env = await s.get(Environment, base.environment_id)
        proj = await s.get(Project, base.project_id)
        found = (await s.scalars(select(Finding).where(Finding.run_id == base.id))).all()
        baseline = {x.test_case_id: ("errored" if x.status == "inconclusive" else "failed") for x in found}
        cases = regression.select([TestCase.model_validate(c) for c in plan.test_cases], f.test_case_id)
        run = Run(id=uid(), display_id=await runs.next_display(Run, proj.id, "RUN", 2481), project_id=proj.id, plan_id=plan.id, environment_id=env.id,
                  name=f"Regression · {f.display_id} · attempt {r.attempt}", trigger="repair", parent_run_id=base.id, counts={"total": len(cases)})
        s.add(run)
        r.regression_run_id = run.id
        await s.commit()
    ctx = runs.Ctx(run)
    try:
        await ctx.state("VALIDATING_INPUT")
        await ctx.state("QUEUED", "regression after approved patch")
        flag = r.patch["flag"]
        await ctx.log("human", "log", f"Patch {r.display_id} approved; switching off planted bug '{flag}' on the demo shop")
        await _bugs(env.hook_url, remove=flag)
        target = Target(base_url=env.base_url, allowed_hosts=proj.allowed_domains, hook_url=env.hook_url,
                        hook_token=os.getenv("TREVYN_HOOK_TOKEN") or None)
        rows = await regression.execute(ctx, cases, target, baseline)
        if not rows:  # cancelled or infrastructure failure: the run already moved to its own terminal state
            await _finish(repair_id, "failed", "The regression run did not finish")
            return
        result = regression.outcome(rows, f.test_case_id)
        async with Session() as s:
            s.add_all([RegressionResult(regression_run_id=run.id, **row) for row in rows])
            await s.commit()
        await ctx.log("det", "finding", f"{r.display_id}: {result} — " + ", ".join(f"{x['test_case_id']} {x['change']}" for x in rows),
                      "ok" if result == "verified" else "failed")
        await ctx.state("COMPLETED", result)
        await _finish(repair_id, result, None)
    except Exception as e:  # infrastructure failure, never "the app has bugs"
        try:
            await ctx.state("FAILED", f"{type(e).__name__}: {e}"[:300])
        except Exception:
            pass
        await _finish(repair_id, "failed", f"{type(e).__name__}: {e}"[:300])


async def _finish(repair_id: str, result: str, note: str | None) -> None:
    async with Session() as s:
        r = await s.get(Repair, repair_id)
        f = await s.get(Finding, r.finding_id)
        r.note = note
        if result == "failed" and r.attempt >= MAX_ATTEMPTS:
            r.outcome = "escalated"
            s.add(Approval(display_id=await runs.next_display(Approval, f.project_id, "AP", 1), project_id=f.project_id, subject_type="release",
                           subject_id=f.id, title=f"Escalated: {f.display_id} not fixed after {MAX_ATTEMPTS} attempts",
                           reason="All repair attempts and their regression results are attached to the finding.", risk="high"))
        else:
            r.outcome = result
        f.board_column = COLUMN.get(result, "investigating")
        await s.commit()
    await runs.audit("system", f"repair.{result}", "repair", repair_id)
    from .integrations import notify
    await notify(f"Trevyn repair {repair_id[:8]}: regression outcome {result}")


@router.get("/api/runs/{run_id}/comparison")
async def comparison(run_id: str, s: AsyncSession = Depends(session)):
    run = await get_or_404(s, Run, run_id)
    rows = (await s.scalars(select(RegressionResult).where(RegressionResult.regression_run_id == run.id))).all()
    if not rows and run.trigger != "repair":
        raise Problem(404, "not_found", "This run is not a regression run")
    rp = await s.scalar(select(Repair).where(Repair.regression_run_id == run.id))
    base = await s.get(Run, run.parent_run_id) if run.parent_run_id else None
    return {"run": run.display_id, "baseline_run": base.display_id if base else None, "repair": rp.display_id if rp else None,
            "outcome": rp.outcome if rp else None,
            "items": [{"test_case_id": x.test_case_id, "baseline": x.baseline_outcome, "rerun": x.rerun_outcome, "change": x.change} for x in rows]}
