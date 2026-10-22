"""Schema (Part 4, Phase 1 subset). One definition for SQLite (local) and Postgres (Supabase).
On Postgres, run_events / audit_log / policy_decisions get append-only triggers."""
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        Path("var").mkdir(exist_ok=True)
        return "sqlite+aiosqlite:///var/trevyn.db"
    return url.replace("postgres://", "postgresql+asyncpg://", 1).replace("postgresql://", "postgresql+asyncpg://", 1) \
        if "+asyncpg" not in url else url


URL = _url()
# Supabase transaction pooler (port 6543) does not support prepared statements
_args = {"statement_cache_size": 0} if ":6543" in URL else {}
engine = create_async_engine(URL, connect_args=_args, pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map = {dict: JSON, list: JSON}


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    allowed_domains: Mapped[list] = mapped_column(default=list)
    retention_days: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Environment(Base):
    __tablename__ = "environments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(50))
    base_url: Mapped[str] = mapped_column(String(500))
    hook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_production: Mapped[bool] = mapped_column(Boolean, default=False)
    local_runner: Mapped[bool] = mapped_column(Boolean, default=False)


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="candidate")  # candidate|approved|rejected|superseded
    requirement: Mapped[str] = mapped_column(Text)
    test_mode: Mapped[str] = mapped_column(String(20), default="black_box")
    source: Mapped[str] = mapped_column(String(20))  # model|template
    stack_hypotheses: Mapped[list] = mapped_column(default=list)
    test_cases: Mapped[list] = mapped_column(default=list)  # TestCase[] (schema-validated on write)
    risk_level: Mapped[str] = mapped_column(String(10), default="low")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (UniqueConstraint("project_id", "idempotency_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    display_id: Mapped[str] = mapped_column(String(20))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"))
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"))
    name: Mapped[str] = mapped_column(String(200))
    state: Mapped[str] = mapped_column(String(30), default="CREATED")
    trigger: Mapped[str] = mapped_column(String(20), default="manual")
    parent_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    counts: Mapped[dict] = mapped_column(default=dict)  # passed/failed/inconclusive/total
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RunEvent(Base):
    __tablename__ = "run_events"
    __table_args__ = (UniqueConstraint("run_id", "seq"),)
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    actor: Mapped[str] = mapped_column(String(20))  # ai|det|human
    event_type: Mapped[str] = mapped_column(String(20))  # state|log|step|assertion|gate|verdict|diagnosis|finding
    summary: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    data: Mapped[dict] = mapped_column(default=dict)
    evidence_refs: Mapped[list] = mapped_column(default=list)


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    test_case_id: Mapped[str] = mapped_column(String(50))
    kind: Mapped[str] = mapped_column(String(30))
    uri: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    bytes: Mapped[int] = mapped_column(Integer)
    redacted: Mapped[bool] = mapped_column(Boolean, default=True)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    display_id: Mapped[str] = mapped_column(String(20))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"))
    test_case_id: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(20), default="ui")
    severity: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20))  # confirmed|needs_review|inconclusive|dismissed|duplicate
    board_column: Mapped[str] = mapped_column(String(20), default="triage")
    expected: Mapped[str] = mapped_column(Text)
    actual: Mapped[str] = mapped_column(Text)
    repro_steps: Mapped[list] = mapped_column(default=list)
    verdict: Mapped[dict] = mapped_column(default=dict)
    diagnosis: Mapped[dict | None] = mapped_column(nullable=True)
    repair_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_ids: Mapped[list] = mapped_column(default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    display_id: Mapped[str] = mapped_column(String(20))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    subject_type: Mapped[str] = mapped_column(String(20))  # run_gate|plan|patch
    subject_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(Text)
    risk: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decided_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ModelCall(Base):
    __tablename__ = "model_calls"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    node: Mapped[str] = mapped_column(String(30))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(50))
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer)
    cost_usd: Mapped[float] = mapped_column(Float)
    stop_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PolicyDecision(Base):
    __tablename__ = "policy_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    action: Mapped[str] = mapped_column(String(30))
    subject_id: Mapped[str] = mapped_column(String(36))
    input: Mapped[dict] = mapped_column(default=dict)
    allow: Mapped[bool] = mapped_column(Boolean)
    reasons: Mapped[list] = mapped_column(default=list)
    obligations: Mapped[list] = mapped_column(default=list)
    policy_version: Mapped[str] = mapped_column(String(20))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(50))
    subject_type: Mapped[str] = mapped_column(String(30))
    subject_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[dict] = mapped_column(default=dict)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


APPEND_ONLY = ("run_events", "audit_log", "policy_decisions")


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if conn.dialect.name == "postgresql":
            await conn.execute(text("""CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
                BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql"""))
            for t in APPEND_ONLY:
                await conn.execute(text(f"DROP TRIGGER IF EXISTS {t}_ro ON {t}"))
                await conn.execute(text(f"CREATE TRIGGER {t}_ro BEFORE UPDATE OR DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION forbid_mutation()"))


async def session() -> AsyncSession:  # FastAPI dependency
    async with Session() as s:
        yield s
