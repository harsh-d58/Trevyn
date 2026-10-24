"""Auth and roles (blueprint Step 2). AUTH_MODE=off (default) runs as a local owner; AUTH_MODE=supabase verifies
Supabase JWTs and applies one global role rule table per route."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

import jwt
from fastapi import APIRouter, Request
from sqlalchemy import select

from .common import Problem
from .db import AuditLog, Project, ProjectMember, Session, User

ORDER = ["viewer", "engineer", "qa_lead", "owner"]
OPEN_PATHS = ("/healthz", "/readyz", "/docs", "/openapi.json", "/redoc", "/api/webhooks/")
DEV_USER = {"sub": "dev", "email": "dev@local", "name": "Local dev", "role": "owner", "approver": True}
_TICKET_KEY = (os.getenv("TICKET_SECRET") or secrets.token_hex(16)).encode()


def mode() -> str:
    return os.getenv("AUTH_MODE", "off")


def decode_token(token: str) -> dict:
    aud = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    try:
        if secret := os.getenv("SUPABASE_JWT_SECRET"):
            return jwt.decode(token, secret, algorithms=["HS256"], audience=aud)
        key = jwt.PyJWKClient(os.environ["SUPABASE_JWKS_URL"]).get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256", "ES256"], audience=aud)
    except (jwt.PyJWTError, KeyError) as e:
        raise Problem(401, "unauthenticated", f"Invalid or expired session ({type(e).__name__})") from e


def mint_ticket(sub: str, ttl: int = 60) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"sub": sub, "exp": int(time.time()) + ttl}).encode()).decode()
    return f"{body}.{hmac.new(_TICKET_KEY, body.encode(), hashlib.sha256).hexdigest()}"


def read_ticket(ticket: str) -> str:
    body, _, sig = ticket.partition(".")
    if not hmac.compare_digest(sig, hmac.new(_TICKET_KEY, body.encode(), hashlib.sha256).hexdigest()):
        raise Problem(401, "unauthenticated", "Invalid stream ticket")
    data = json.loads(base64.urlsafe_b64decode(body))
    if data["exp"] < time.time():
        raise Problem(401, "unauthenticated", "Stream ticket expired")
    return data["sub"]


def required(method: str, path: str) -> tuple[str, bool]:
    """(minimum role, needs approver flag) for a request."""
    if path.startswith(("/api/members", "/api/audit", "/api/policies", "/api/integrations")) and method != "GET":
        return "owner", False
    if path.startswith(("/api/members", "/api/audit")):
        return "owner", False
    if method in ("GET", "HEAD") or path in ("/api/assistant/chat", "/api/sse-ticket"):
        return "viewer", False
    if path.endswith("/decision") or path.endswith("/verify"):
        return "engineer", True
    return "engineer", False


async def _resolve(claims: dict) -> dict:
    sub = claims["sub"]
    async with Session() as s:
        u = await s.scalar(select(User).where(User.auth_sub == sub))
        if not u:
            u = User(auth_sub=sub, email=claims.get("email", ""), name=(claims.get("user_metadata") or {}).get("name", claims.get("email", "")))
            s.add(u)
            await s.flush()
        proj = await s.scalar(select(Project).order_by(Project.created_at))
        mem = await s.get(ProjectMember, (proj.id, u.id))
        if not mem:  # the first person to sign in owns the workspace; later people start as viewers
            first = not await s.scalar(select(ProjectMember).where(ProjectMember.project_id == proj.id))
            mem = ProjectMember(project_id=proj.id, user_id=u.id, role="owner" if first else "viewer", is_approver=first)
            s.add(mem)
        await s.commit()
        return {"sub": sub, "id": u.id, "email": u.email, "name": u.name, "role": mem.role, "approver": mem.is_approver}


async def authorize(request: Request) -> None:
    """Global dependency: sets request.state.user and enforces the role table."""
    path = request.url.path
    if mode() == "off":
        request.state.user = DEV_USER
        return
    if path.startswith(OPEN_PATHS):
        return
    ticket = request.query_params.get("ticket")
    if ticket and path.endswith("/stream") and request.method == "GET":
        claims = {"sub": read_ticket(ticket)}
    else:
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            raise Problem(401, "unauthenticated", "Sign in to continue")
        claims = decode_token(header[7:])
    user = await _resolve(claims)
    request.state.user = user
    role, needs_approver = required(request.method, path)
    if ORDER.index(user["role"]) < ORDER.index(role):
        raise Problem(403, "permission_denied", f"This needs the {role} role; you are {user['role']}")
    if needs_approver and not user["approver"]:
        raise Problem(403, "permission_denied", "Only approvers can decide this")


router = APIRouter()


@router.get("/api/me")
async def me(request: Request):
    return {**request.state.user, "auth_mode": mode()}


@router.post("/api/sse-ticket")
async def sse_ticket(request: Request):
    return {"ticket": mint_ticket(request.state.user["sub"]), "expires_in": 60}


@router.get("/api/members")
async def members():
    async with Session() as s:
        rows = (await s.execute(select(ProjectMember, User).join(User, User.id == ProjectMember.user_id))).all()
    return {"items": [{"user_id": u.id, "email": u.email, "name": u.name, "role": m.role, "approver": m.is_approver} for m, u in rows]}


@router.put("/api/members/{user_id}")
async def set_member(user_id: str, body: dict, request: Request):
    role = body.get("role", "viewer")
    if role not in ORDER:
        raise Problem(422, "validation_error", f"role must be one of {ORDER}")
    async with Session() as s:
        proj = await s.scalar(select(Project).order_by(Project.created_at))
        m = await s.get(ProjectMember, (proj.id, user_id))
        if not m:
            raise Problem(404, "not_found", "No such member")
        m.role, m.is_approver = role, bool(body.get("approver", m.is_approver))
        s.add(AuditLog(actor=request.state.user["sub"], action="member.update", subject_type="user", subject_id=user_id,
                       details={"role": m.role, "approver": m.is_approver}))
        await s.commit()
    return {"ok": True, "role": role, "approver": m.is_approver}


@router.get("/api/audit")
async def audit_list(action: str | None = None, limit: int = 100):
    async with Session() as s:
        q = select(AuditLog).order_by(AuditLog.ts.desc()).limit(min(limit, 500))
        if action:
            q = q.where(AuditLog.action == action)
        rows = (await s.scalars(q)).all()
    return {"items": [{"id": a.id, "ts": a.ts.isoformat(), "actor": a.actor, "action": a.action, "subject_type": a.subject_type,
                       "subject_id": a.subject_id, "details": a.details} for a in rows]}
