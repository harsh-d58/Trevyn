"""Cross-process contracts (BACKEND_AND_REMAINING_WORK.md Part 3). Pydantic is the source of truth;
`python -m trevyn_contracts` exports JSON Schema to /schemas for the TS side."""
from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

ACTIONS = ("goto", "click", "dblclick", "fill", "select", "press", "wait_for", "reset")
ASSERT_KINDS = ("ui_text", "url", "count", "network_posts", "db_row_count", "status")


class TestMode(StrEnum):
    black_box = "black_box"
    gray_box = "gray_box"
    white_box = "white_box"


class Step(BaseModel):
    action: Literal["goto", "click", "dblclick", "fill", "select", "press", "wait_for", "reset"]
    target: str | None = None  # role=button[name=Place order] | label=Email | testid=x | text=... | css=... | /path
    value: str | None = None
    note: str | None = None


class Assertion(BaseModel):
    kind: Literal["ui_text", "url", "count", "network_posts", "db_row_count", "status"]
    subject: str  # locator, url path, or hook name ("orders")
    op: Literal["eq", "lte", "gte", "contains", "matches"]
    expected: str | int | float | bool


class TestCase(BaseModel):
    test_case_id: str
    title: str
    requirement_ref: str | None = None
    preconditions: list[str] = []
    steps: list[Step] = Field(min_length=1, max_length=40)
    expected_result: str
    assertions: list[Assertion] = Field(min_length=1)
    side_effects: list[str] = []
    risk: Literal["low", "medium", "high"] = "low"
    timeout_budget_s: int = Field(default=90, le=600)


class PlanDraft(BaseModel):
    """What the model is allowed to produce. Everything else is filled in by code."""
    stack_hypotheses: list[str] = []
    test_cases: list[TestCase]


class PageMap(BaseModel):
    path: str
    title: str = ""
    headings: list[str] = []
    links: list[dict[str, str]] = []
    buttons: list[str] = []
    fields: list[dict] = []
    has_login_form: bool = False
    aria_snapshot: str = ""


class SiteMap(BaseModel):
    start_url: str
    pages: list[PageMap] = []
    crawled_at: str
    truncated: bool = False
    errors: list[str] = []


# ---- runner contract (Part 3.3) ----
class Target(BaseModel):
    base_url: str
    allowed_hosts: list[str]
    hook_url: str | None = None  # read-only verification hooks (demo shop /__trevyn)
    hook_token: str | None = None


class RunnerJob(BaseModel):
    job_id: str
    run_id: str
    kind: Literal["playwright"] = "playwright"
    target: Target
    test_cases: list[TestCase]
    browser: str = "chromium"
    headless: bool = True
    out_dir: str


class StepResult(BaseModel):
    i: int
    action: str
    ok: bool
    t_ms: int
    error: str | None = None
    screenshot: str | None = None


class AssertionResult(BaseModel):
    i: int
    evaluated: bool
    ok: bool
    observed: str | int | float | bool | None = None
    expected: str | int | float | bool | None = None
    message: str = ""


class DupPost(BaseModel):
    url: str
    count: int
    ms_apart: int


class CaseResult(BaseModel):
    test_case_id: str
    outcome: Literal["passed", "failed", "errored", "skipped"]
    steps: list[StepResult] = []
    assertions: list[AssertionResult] = []
    requests: int = 0
    failed_requests: int = 0
    dup_posts: list[DupPost] = []
    egress_blocked: list[str] = []
    console_errors: int = 0
    console_warnings: int = 0
    artefacts: dict[str, str] = {}  # kind -> path (trace, network, console, screenshot_failure)


class RunnerResult(BaseModel):
    job_id: str
    status: Literal["completed", "infra_error", "timeout", "cancelled"]
    cases: list[CaseResult] = []
    error: str | None = None
    runner_version: str = "trevyn-runner-py@0.1.0"
    started_at: str = ""
    ended_at: str = ""


# ---- verifier output (Part 11) ----
class Verdict(BaseModel):
    status: Literal["confirmed", "needs_review", "inconclusive", "passed"]
    rule: str
    reason: str | None = None
    reproduced: str = "1/1"
    checks: dict[str, bool | str] = {}
    explanation: str | None = None
    explanation_by: str | None = None


class Hypothesis(BaseModel):
    statement: str
    supporting_evidence_ids: list[str] = []
    confidence: Literal["low", "medium", "high"]


class Diagnosis(BaseModel):
    hypotheses: list[Hypothesis]
    verified_observations: list[str] = []
    unknowns: list[str] = []
