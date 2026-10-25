"""Unit tests for the deterministic parts of the core: verifier, diff guard, regression, SSRF guard, auth rules, manifest."""
import base64
import socket
import time

import jwt
import pytest

from trevyn_api import auth, manifest, targets
from trevyn_api.common import Problem
from trevyn_contracts import AssertionResult, CaseResult, PlanDraft, Step, StepResult, TestCase
from trevyn_orch import diff_guard, planner, regression
from trevyn_orch.verifier import verify


def tc(**kw) -> TestCase:
    base = dict(test_case_id="T-1", title="t", expected_result="ok", steps=[Step(action="goto", target="/checkout")],
                assertions=[{"kind": "count", "subject": "css=x", "op": "eq", "expected": 1}])
    return TestCase(**{**base, **kw})


def case(outcome="failed", evaluated=True, ok=False, observed=2, dup=False, artefacts=True) -> CaseResult:
    from trevyn_contracts import DupPost
    return CaseResult(test_case_id="T-1", outcome=outcome, steps=[StepResult(i=0, action="goto", ok=True, t_ms=5)],
                      assertions=[AssertionResult(i=0, evaluated=evaluated, ok=ok, observed=observed if evaluated else None, expected=1)],
                      dup_posts=[DupPost(url="/api/orders", count=2, ms_apart=3)] if dup else [],
                      artefacts={"trace": "t.zip", "network": "n.json", "screenshot_failure": "s.png"} if artefacts else {})


# ---- verifier ----
def test_verifier_passes_when_assertions_hold():
    assert verify(tc(), case("passed", ok=True, observed=1)).status == "passed"


def test_unevaluated_assertion_is_inconclusive_never_a_bug():
    v = verify(tc(), case("errored", evaluated=False))
    assert (v.status, v.reason) == ("inconclusive", "assertion_not_evaluated")


def test_confirmed_needs_repeat_or_deterministic_signal():
    assert verify(tc(), case(dup=True)).status == "confirmed"
    assert verify(tc(), case(), repeat=case()).reproduced == "2/2"
    assert verify(tc(), case()).status == "needs_review"  # one unrepeated observation is not enough


def test_flaky_repeat_needs_review():
    v = verify(tc(), case(), repeat=case("passed", ok=True, observed=1))
    assert (v.status, v.reason) == ("needs_review", "flaky")


def test_weak_evidence_needs_review():
    assert verify(tc(), case(dup=True, artefacts=False)).status == "needs_review"


# ---- diff guard ----
GOOD = "--- a/app/orders.py\n+++ b/app/orders.py\n@@\n-    x = 1\n+    x = 2\n"


def test_diff_guard_accepts_a_small_app_change():
    r = diff_guard.check(GOOD)
    assert not r["refused"] and not r["requires_review"] and r["files"] == ["app/orders.py"]


@pytest.mark.parametrize("path", ["tests/test_orders.py", "e2e/checkout.spec.ts", "src/a.test.ts"])
def test_diff_guard_flags_test_edits(path):
    r = diff_guard.check(f"--- a/{path}\n+++ b/{path}\n@@\n-assert x\n+pass\n")
    assert r["requires_review"] and not r["refused"]


def test_diff_guard_refuses_secrets_and_huge_and_empty():
    assert diff_guard.check(GOOD + '+API_KEY = "sk-abcdefgh12345678"\n')["refused"]
    assert diff_guard.check("--- a/a.py\n+++ b/a.py\n" + "+x\n" * 400)["refused"]
    assert diff_guard.check("no diff here")["refused"]


# ---- regression ----
@pytest.mark.parametrize("base,rerun,expected", [("failed", "passed", "fixed"), ("failed", "failed", "still_failing"),
                                                 ("passed", "failed", "new_failure"), ("passed", "passed", "unchanged_pass"),
                                                 ("failed", "errored", "inconclusive")])
def test_classify(base, rerun, expected):
    assert regression.classify(base, rerun) == expected


def test_outcome_requires_original_fixed_and_no_new_failures():
    row = lambda i, c: {"test_case_id": i, "change": c}  # noqa: E731
    assert regression.outcome([row("A", "fixed"), row("B", "unchanged_pass")], "A") == "verified"
    assert regression.outcome([row("A", "fixed"), row("B", "new_failure")], "A") == "failed"
    assert regression.outcome([row("A", "still_failing")], "A") == "failed"


def test_selection_keeps_original_first_and_related_cases():
    a = tc(test_case_id="A", requirement_ref="R1")
    b = tc(test_case_id="B", requirement_ref="R1", steps=[Step(action="goto", target="/login")])
    c = tc(test_case_id="C", requirement_ref="R2", steps=[Step(action="goto", target="/checkout")])  # same route
    d = tc(test_case_id="D", requirement_ref="R3", steps=[Step(action="goto", target="/profile")])
    assert [x.test_case_id for x in regression.select([d, a, b, c], "A")] == ["A", "b".upper(), "C"]


# ---- planner validator ----
def test_planner_validator_rejects_offsite_goto_and_unreset_side_effects():
    bad = tc(steps=[Step(action="goto", target="https://evil.example/x")], side_effects=["creates_order"])
    errs = planner.validate(PlanDraft(test_cases=[bad]), ["shop.test"])
    assert any("off the allowlist" in e for e in errs) and any("reset" in e for e in errs)


# ---- SSRF guard ----
def fake(ip):
    return lambda host, port: [(socket.AF_INET, 0, 0, "", (ip, port))]


@pytest.mark.parametrize("ip", ["169.254.169.254", "127.0.0.1", "10.0.0.5", "192.168.1.9", "172.16.4.4", "100.64.0.1"])
def test_private_targets_are_blocked(ip, monkeypatch):
    monkeypatch.delenv("ALLOW_PRIVATE_TARGETS", raising=False)
    assert "private" in targets.check_url("http://app.example", resolve=fake(ip))


def test_public_target_and_bad_urls(monkeypatch):
    monkeypatch.delenv("ALLOW_PRIVATE_TARGETS", raising=False)
    assert targets.check_url("https://app.example", resolve=fake("93.184.216.34")) is None
    assert targets.check_url("ftp://x") and targets.check_url("not a url")
    monkeypatch.setenv("ALLOW_PRIVATE_TARGETS", "1")
    assert targets.check_url("http://localhost:3100") is None


def test_ipv4_mapped_internal_address_is_blocked(monkeypatch):
    monkeypatch.delenv("ALLOW_PRIVATE_TARGETS", raising=False)
    assert "private" in targets.check_url("https://app.example", resolve=fake("::ffff:127.0.0.1"))
    assert targets.check_url("https://user:pass@app.example", resolve=fake("93.184.216.34"))


# ---- auth ----
def test_role_rules():
    assert auth.required("GET", "/api/runs") == ("viewer", False)
    assert auth.required("POST", "/api/runs") == ("engineer", False)
    assert auth.required("POST", "/api/approvals/x/decision") == ("engineer", True)
    assert auth.required("POST", "/api/repairs/x/verify") == ("engineer", True)
    assert auth.required("GET", "/api/audit") == ("owner", False)
    assert auth.required("PUT", "/api/members/u") == ("owner", False)
    assert auth.required("POST", "/api/assistant/chat") == ("viewer", False)


def test_jwt_decode_and_rejection(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s" * 40)
    good = jwt.encode({"sub": "u1", "aud": "authenticated", "exp": time.time() + 60}, "s" * 40, algorithm="HS256")
    assert auth.decode_token(good)["sub"] == "u1"
    for bad in (jwt.encode({"sub": "u1", "aud": "authenticated", "exp": time.time() - 5}, "s" * 40, algorithm="HS256"),
                jwt.encode({"sub": "u1", "aud": "authenticated", "exp": time.time() + 60}, "x" * 40, algorithm="HS256"), "garbage"):
        with pytest.raises(Problem) as e:
            auth.decode_token(bad)
        assert e.value.status_code == 401


def test_sse_ticket_roundtrip_and_tamper():
    t = auth.mint_ticket("u1")
    assert auth.read_ticket(t) == "u1"
    with pytest.raises(Problem):
        auth.read_ticket(t[:-2] + "00")
    with pytest.raises(Problem):
        auth.read_ticket(auth.mint_ticket("u1", ttl=-1))


# ---- manifest ----
def test_manifest_signature_detects_one_changed_byte(monkeypatch):
    monkeypatch.setenv("MANIFEST_SIGNING_KEY", base64.b64encode(b"k" * 32).decode())
    signed = manifest.sign({"run": "RUN-1", "events": [[1, "abc"], [2, "def"]], "evidence": []})
    assert manifest.verify_signature(signed["manifest"], signed["signature"], signed["public_key"])
    tampered = {**signed["manifest"], "events": [[1, "abc"], [2, "dex"]]}
    assert not manifest.verify_signature(tampered, signed["signature"], signed["public_key"])
