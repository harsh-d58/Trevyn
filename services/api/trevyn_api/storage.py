"""Evidence store (Step 8). S3-compatible object storage when S3_* is configured, local files otherwise."""
from __future__ import annotations

import asyncio
import hashlib
import os
from datetime import UTC, timedelta
from pathlib import Path

from sqlalchemy import select

from .db import Evidence, Project, Run, Session, now

S3_VARS = ("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY")


def s3_enabled() -> bool:
    return all(os.getenv(k) for k in S3_VARS)


def url_ttl() -> int:
    return int(os.getenv("EVIDENCE_URL_TTL_S", "300"))


def _client():
    import boto3
    return boto3.client("s3", endpoint_url=os.getenv("S3_ENDPOINT"), aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
                        region_name=os.getenv("S3_REGION", "us-east-1"))


def _split(uri: str) -> tuple[str, str]:
    bucket, _, key = uri.removeprefix("s3://").partition("/")
    return bucket, key


def evidence_key(project_id: str, run_id: str, case_id: str, kind: str, filename: str) -> str:
    return f"projects/{project_id}/runs/{run_id}/{case_id}/{kind}/{filename}"


async def upload(local_path: str | Path, key: str) -> str:
    bucket = os.environ["S3_BUCKET"]
    await asyncio.to_thread(_client().upload_file, str(local_path), bucket, key)
    return f"s3://{bucket}/{key}"


def presign(uri: str) -> str | None:
    if not uri.startswith("s3://") or not s3_enabled():
        return None
    bucket, key = _split(uri)
    return _client().generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=url_ttl())


async def store_evidence(run_id: str, project_id: str, case_id: str, kind: str, path: str) -> tuple[str, str, int]:
    """Hash the file and (if S3 is configured) upload it. Returns (uri, sha256, size)."""
    p = Path(path)
    data = await asyncio.to_thread(p.read_bytes)
    sha, size = hashlib.sha256(data).hexdigest(), len(data)
    if not s3_enabled():
        return str(p), sha, size
    uri = await upload(p, evidence_key(project_id, run_id, case_id, kind, p.name))
    p.unlink(missing_ok=True)  # the bucket is now the source of truth
    return uri, sha, size


async def _delete(uri: str) -> None:
    if uri.startswith("s3://"):
        bucket, key = _split(uri)
        await asyncio.to_thread(_client().delete_object, Bucket=bucket, Key=key)
    else:
        Path(uri).unlink(missing_ok=True)


async def purge_expired(days: int | None = None) -> int:
    """Delete evidence objects/files past retention (projects.retention_days, or `days` if given).
    Rows are kept with uri="" so GET /api/evidence answers 404 'evidence expired'. Returns the count purged."""
    purged = 0
    async with Session() as s:
        rows = (await s.execute(select(Evidence, Run.started_at, Project.retention_days)
                                .join(Run, Run.id == Evidence.run_id).join(Project, Project.id == Run.project_id)
                                .where(Evidence.uri != ""))).all()
        t = now()
        for ev, started, retention in rows:
            started = started if started.tzinfo else started.replace(tzinfo=UTC)
            if started < t - timedelta(days=retention if days is None else days):
                await _delete(ev.uri)
                ev.uri = ""
                purged += 1
        await s.commit()
    return purged
