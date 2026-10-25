"""Fail closed when a public Render service is missing shared infrastructure or auth."""
from __future__ import annotations

import os


def require_public_config() -> None:
    if os.getenv("TREVYN_PUBLIC_DEPLOY") != "1":
        return
    required = ("DATABASE_URL", "REDIS_URL", "CORS_ORIGINS", "S3_ENDPOINT", "S3_BUCKET",
                "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
                "TICKET_SECRET", "MANIFEST_SIGNING_KEY")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Public deployment is missing: " + ", ".join(missing))
    if not (os.getenv("SUPABASE_JWKS_URL") or os.getenv("SUPABASE_JWT_SECRET")):
        raise RuntimeError("Public deployment requires SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET")
    if not os.environ["DATABASE_URL"].startswith(("postgres://", "postgresql://", "postgresql+asyncpg://")):
        raise RuntimeError("Public deployment requires PostgreSQL")
    if os.getenv("AUTH_MODE") != "supabase":
        raise RuntimeError("Public deployment requires AUTH_MODE=supabase")
    if "localhost" in os.environ["CORS_ORIGINS"] or "*" in os.environ["CORS_ORIGINS"]:
        raise RuntimeError("Set CORS_ORIGINS to the exact Vercel origin")
