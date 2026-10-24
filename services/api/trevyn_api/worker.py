"""Celery worker (blueprint Step 3). Used only when REDIS_URL is set.
Run:  uv run celery -A trevyn_api.worker worker -Q orchestrator,maintenance --pool=solo --loglevel=info
Beat: uv run celery -A trevyn_api.worker beat --loglevel=info"""
from __future__ import annotations

import asyncio
import os

from celery import Celery

from . import main as _env  # noqa: F401  (loads .env before settings are read)

app = Celery("trevyn", broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"))
app.conf.update(
    task_acks_late=True, worker_prefetch_multiplier=1, task_reject_on_worker_lost=True, task_default_queue="orchestrator",
    task_routes={"trevyn.maintenance.*": {"queue": "maintenance"}},
    beat_schedule={"reap-stale-runs": {"task": "trevyn.maintenance.reap_stale", "schedule": 300.0}},
)


def _run(coro):
    """Each task gets a fresh event loop; the DB engine's pooled connections belong to the previous loop, so drop them."""
    from . import runs
    from .db import engine

    async def wrapped():
        try:
            return await coro
        finally:  # async clients and locks are bound to this loop; the next task gets a new loop
            await engine.dispose()
            if runs._redis is not None:
                await runs._redis.aclose()
            runs._redis = None
            runs._seq_locks.clear()
            runs._run_locks.clear()
    return asyncio.run(wrapped())


@app.task(bind=True, name="trevyn.run.execute", autoretry_for=(ConnectionError, OSError),
          retry_backoff=True, max_retries=None, retry_kwargs={"max_retries": 2})
def run_execute(self, run_id: str) -> None:
    from .runs import RunSlotBusy, SLOT_POLL_SECONDS, execute_run
    try:
        _run(execute_run(run_id, wait_for_queue=False))
    except RunSlotBusy as exc:
        raise self.retry(exc=exc, countdown=SLOT_POLL_SECONDS)


@app.task(name="trevyn.run.resume", autoretry_for=(ConnectionError, OSError), retry_backoff=True, max_retries=2)
def run_resume(run_id: str, approval_id: str, approve: bool) -> None:
    from .runs import resume_run
    _run(resume_run(run_id, approval_id, approve))


@app.task(name="trevyn.run.regression", autoretry_for=(ConnectionError, OSError), retry_backoff=True, max_retries=2)
def run_regression(repair_id: str) -> None:
    from .repairs import run_regression as go
    _run(go(repair_id))


@app.task(name="trevyn.maintenance.reap_stale")
def reap_stale() -> list[str]:
    from .runs import reap_stale as reap
    return _run(reap())
