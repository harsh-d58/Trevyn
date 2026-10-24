"""Steps 8 and 11: evidence store (fake S3 client; PyPI unreachable for moto), retention, GitHub HMAC, Jira, status."""
import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest

from trevyn_api import integrations, runs, storage
from trevyn_api.db import AuditLog, Environment, Evidence, Plan, Project, Run, Session, init_db, now
from trevyn_api.main import app

S3_ENV = {"S3_ENDPOINT": "http://s3.local", "S3_BUCKET": "ev", "S3_ACCESS_KEY_ID": "AK", "S3_SECRET_ACCESS_KEY": "SK"}
SECRETS = {"GITHUB_WEBHOOK_SECRET": "ghsecret-xyz", "SLACK_WEBHOOK_URL": "https://hooks.slack/secret-abc",
           **S3_ENV, "S3_SECRET_ACCESS_KEY": "s3secret-qrs"}


class FakeS3:
    objects: dict = {}

    def upload_file(self, path, bucket, key):
        self.objects[(bucket, key)] = open(path, "rb").read()

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def generate_presigned_url(self, op, Params, ExpiresIn):
        return f"https://s3.local/{Params['Bucket']}/{Params['Key']}?X-Amz-Expires={ExpiresIn}"


@pytest.fixture
def s3(monkeypatch):
    for k, v in S3_ENV.items():
        monkeypatch.setenv(k, v)
    FakeS3.objects = {}
    monkeypatch.setattr(storage, "_client", lambda: FakeS3())
    return FakeS3.objects


@pytest.fixture
async def world(monkeypatch):
    monkeypatch.setattr(runs, "dispatch", lambda *a, **k: None)
    await init_db()
    async with Session() as s:
        p = Project(name="SI", allowed_domains=["localhost"], retention_days=7)
        s.add(p)
        await s.flush()
        e = Environment(project_id=p.id, name="demo", base_url="http://localhost:3100", local_runner=True)
        s.add(e)
        await s.flush()
        pl = Plan(project_id=p.id, environment_id=e.id, requirement="checkout", source="template", test_cases=[], status="approved")
        s.add(pl)
        await s.flush()
        r = Run(display_id=await runs.next_display(Run, p.id, "RUN", 1), project_id=p.id, plan_id=pl.id, environment_id=e.id, name="t")
        s.add(r)
        await s.commit()
        return p, r


@pytest.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def add_ev(run, uri):
    async with Session() as s:
        ev = Evidence(run_id=run.id, test_case_id="T-1", kind="screenshot", uri=uri, sha256="x", bytes=1)
        s.add(ev)
        await s.commit()
        return ev


# ---- Step 8 ----
async def test_store_evidence_uploads_to_s3_key(s3, world, tmp_path):
    p, r = world
    f = tmp_path / "shot.png"
    f.write_bytes(b"png-bytes")
    uri, sha, size = await storage.store_evidence(r.id, p.id, "T-1", "screenshot", str(f))
    key = f"projects/{p.id}/runs/{r.id}/T-1/screenshot/shot.png"
    assert uri == f"s3://ev/{key}" and s3[("ev", key)] == b"png-bytes"
    assert (sha, size) == (hashlib.sha256(b"png-bytes").hexdigest(), 9)


async def test_store_evidence_local_when_unset(world, tmp_path, monkeypatch):
    for k in S3_ENV:
        monkeypatch.delenv(k, raising=False)
    p, r = world
    f = tmp_path / "n.json"
    f.write_text("{}")
    uri, _, size = await storage.store_evidence(r.id, p.id, "T-1", "network", str(f))
    assert uri == str(f) and size == 2 and f.exists()


async def test_get_evidence_redirects_and_url_is_audited(s3, world, client, monkeypatch):
    monkeypatch.setenv("EVIDENCE_URL_TTL_S", "120")
    _, r = world
    ev = await add_ev(r, "s3://ev/projects/a/b.png")
    res = await client.get(f"/api/evidence/{ev.id}", follow_redirects=False)
    assert res.status_code == 307 and res.headers["location"].startswith("https://s3.local/ev/projects/a/b.png")
    body = (await client.get(f"/api/evidence/{ev.id}/url")).json()
    assert body["expires_in"] == 120 and "X-Amz-Expires=120" in body["url"]
    async with Session() as s:
        from sqlalchemy import select
        assert await s.scalar(select(AuditLog).where(AuditLog.action == "evidence.read", AuditLog.subject_id == ev.id))


async def test_purge_expired_keeps_row_and_404s(s3, world, client, tmp_path):
    p, r = world
    async with Session() as s:
        (await s.get(Run, r.id)).started_at = now() - timedelta(days=10)
        await s.commit()
    s3[("ev", "old.png")] = b"x"
    old = await add_ev(r, "s3://ev/old.png")
    local = tmp_path / "old.json"
    local.write_text("{}")
    old_local = await add_ev(r, str(local))
    assert await storage.purge_expired() >= 2
    assert ("ev", "old.png") not in s3 and not local.exists()
    async with Session() as s:
        assert (await s.get(Evidence, old.id)).uri == "" and (await s.get(Evidence, old_local.id)).uri == ""
    res = await client.get(f"/api/evidence/{old.id}")
    assert res.status_code == 404 and res.json()["detail"] == "evidence expired"


# ---- Step 11 ----
def sign(body: bytes, secret="ghsecret-xyz") -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


PR = json.dumps({"action": "opened", "repository": {"full_name": "example/shop"},
                 "pull_request": {"number": 7, "title": "fix", "head": {"sha": "abc"}}}).encode()


async def test_github_webhook_unset_secret_503(client, monkeypatch):
    monkeypatch.delenv("GITHUB_WEBHOOK_SECRET", raising=False)
    assert (await client.post("/api/webhooks/github", content=PR)).status_code == 503


async def test_github_webhook_missing_and_invalid_signature_401(client, monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "ghsecret-xyz")
    r1 = await client.post("/api/webhooks/github", content=PR, headers={"X-GitHub-Event": "pull_request"})
    r2 = await client.post("/api/webhooks/github", content=PR,
                           headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": sign(PR, "wrong")})
    assert r1.status_code == r2.status_code == 401
    assert r1.headers["content-type"].startswith("application/problem+json")


async def test_github_webhook_valid_pr_starts_ci_run(world, client, monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "ghsecret-xyz")
    async with Session() as s:
        (await s.get(Project, world[0].id)).repository_url = "https://github.com/example/shop"
        await s.commit()
    res = await client.post("/api/webhooks/github", content=PR,
                            headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": sign(PR)})
    assert res.status_code == 200, res.text
    assert res.json()["run"]["trigger"] == "ci"


async def test_github_webhook_rejects_unconnected_repository(world, client, monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "ghsecret-xyz")
    other = PR.replace(b"example/shop", b"example/unconnected")
    res = await client.post("/api/webhooks/github", content=other,
                            headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": sign(other)})
    assert res.status_code == 404


async def test_github_webhook_other_event_ignored(client, monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "ghsecret-xyz")
    body = b'{"zen": "hi"}'
    res = await client.post("/api/webhooks/github", content=body, headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": sign(body)})
    assert res.status_code == 202


async def test_jira_unset_503(client, monkeypatch):
    for k in integrations.JIRA_VARS:
        monkeypatch.delenv(k, raising=False)
    res = await client.post("/api/findings/F-1/jira")
    assert res.status_code == 503 and res.json()["type"] == "integration_unavailable"


async def test_slack_notify_noop_when_unset(monkeypatch):
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    assert await integrations.notify("hi") is False


async def test_integrations_status_has_no_secrets(client, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    res = await client.get("/api/integrations")
    body = res.json()
    assert body == {"github": True, "slack": True, "jira": body["jira"], "s3": True, "opa": body["opa"]}
    assert all(isinstance(v, bool) for v in body.values())
    assert not any(v in res.text for v in SECRETS.values())
