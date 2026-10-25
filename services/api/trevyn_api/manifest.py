"""Signed run manifest (blueprint Step 7). The signature proves the recorded bytes have not changed since signing;
it does not prove the test was truthful, so the UI says "integrity verified", never "verified correct"."""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from fastapi import APIRouter
from sqlalchemy import select

from .common import Problem, get_or_404
from .db import Evidence, ModelCall, Plan, Run, RunEvent, Session

router = APIRouter()
KEY_FILE = Path("var/manifest_key.pem")


def _key() -> Ed25519PrivateKey:
    if seed := os.getenv("MANIFEST_SIGNING_KEY"):  # base64 of a 32-byte seed
        return Ed25519PrivateKey.from_private_bytes(base64.b64decode(seed))
    if KEY_FILE.exists():
        return serialization.load_pem_private_key(KEY_FILE.read_bytes(), None)
    KEY_FILE.parent.mkdir(exist_ok=True)
    k = Ed25519PrivateKey.generate()
    KEY_FILE.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return k


def _pub(k: Ed25519PrivateKey) -> str:
    return base64.b64encode(k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()


def canonical(obj: dict) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


def sign(manifest: dict) -> dict:
    k = _key()
    return {"manifest": manifest, "signature": base64.b64encode(k.sign(canonical(manifest))).decode(), "public_key": _pub(k), "algorithm": "ed25519"}


def verify_signature(manifest: dict, signature: str, public_key: str) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key)).verify(base64.b64decode(signature), canonical(manifest))
        return True
    except Exception:
        return False


async def build(run: Run) -> dict:
    async with Session() as s:
        evs = (await s.scalars(select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.seq))).all()
        evid = (await s.scalars(select(Evidence).where(Evidence.run_id == run.id).order_by(Evidence.id))).all()
        calls = (await s.scalars(select(ModelCall).where(ModelCall.run_id == run.id).order_by(ModelCall.ts))).all()
        plan = await s.get(Plan, run.plan_id)
    h = lambda o: hashlib.sha256(canonical(o)).hexdigest()  # noqa: E731
    return {"run": run.display_id, "run_uuid": run.id, "state": run.state, "plan_hash": h({"id": plan.id, "version": plan.version, "cases": plan.test_cases}),
            "events": [[e.seq, h({"actor": e.actor, "type": e.event_type, "summary": e.summary, "status": e.status})] for e in evs],
            "evidence": [[e.id, e.sha256] for e in evid], "model_calls": [[c.node, c.model, c.input_tokens, c.output_tokens] for c in calls]}


@router.get("/api/runs/{run_id}/manifest")
async def get_manifest(run_id: str):
    async with Session() as s:
        run = await get_or_404(s, Run, run_id)
    if run.state not in ("COMPLETED", "FAILED", "CANCELLED", "BLOCKED"):
        raise Problem(409, "conflict", "The manifest is signed when the run ends")
    return sign(await build(run))


@router.post("/api/runs/{run_id}/manifest/verify")
async def verify_manifest(run_id: str, body: dict):
    async with Session() as s:
        run = await get_or_404(s, Run, run_id)
    manifest = body.get("manifest") or {}
    # A caller can sign the database's unchanged manifest with their own key. Only
    # the server's configured signing key proves that Trevyn signed these bytes.
    trusted_key = _pub(_key())
    valid = body.get("public_key") == trusted_key and verify_signature(
        manifest, body.get("signature", ""), trusted_key)
    matches = manifest == await build(run)
    return {"signature_valid": valid, "matches_database": matches, "integrity_verified": valid and matches}
