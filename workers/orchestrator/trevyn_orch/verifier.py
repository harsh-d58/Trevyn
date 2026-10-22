"""Deterministic verifier (Part 11). Pure functions; the model may only explain a verdict afterwards."""
from __future__ import annotations

from trevyn_contracts import CaseResult, TestCase, Verdict

COUNT_KINDS = ("db_row_count", "network_posts")


def verify(tc: TestCase, first: CaseResult, repeat: CaseResult | None = None, repeat_note: str = "") -> Verdict:
    checks: dict[str, bool | str] = {}
    steps_ok = all(s.ok for s in first.steps) and len(first.steps) == len(tc.steps)
    failed_step = next((s for s in first.steps if not s.ok), None)
    checks["V1"] = steps_ok or (failed_step is not None and failed_step.i == len(tc.steps) - 1)
    if not checks["V1"]:
        return Verdict(status="inconclusive", rule="V1", reason="setup_failed", checks=checks)
    checks["V2"] = steps_ok
    if not steps_ok:
        return Verdict(status="inconclusive", rule="V2", reason="action_not_executed", checks=checks)
    checks["V3"] = all(a.evaluated for a in first.assertions)
    if not checks["V3"]:
        return Verdict(status="inconclusive", rule="V3", reason="assertion_not_evaluated", checks=checks)
    checks["V4"] = all(a.observed is not None for a in first.assertions)
    if not checks["V4"]:
        return Verdict(status="inconclusive", rule="V4", reason="missing_observation", checks=checks)
    if all(a.ok for a in first.assertions):
        return Verdict(status="passed", rule="V1-V4+assertions", checks=checks)

    checks["V5"] = "trace" in first.artefacts and ("screenshot_failure" in first.artefacts or any(s.screenshot for s in first.steps)) \
        and "network" in first.artefacts
    failing = [(tc.assertions[a.i], a) for a in first.assertions if not a.ok]
    count_fail = [(spec, a) for spec, a in failing if spec.kind in COUNT_KINDS]
    # V7: a "too many" count failure must actually show more than expected, or a duplicate request
    checks["V7"] = all(float(a.observed) > float(spec.expected) for spec, a in count_fail) or bool(first.dup_posts) \
        if count_fail else True
    deterministic = bool(first.dup_posts)
    if repeat is None:
        checks["V6"] = repeat_note or "not_repeated"
        reproduced = "1/1"
    else:
        checks["V6"] = "repeated_with_fixture_reset"
        reproduced = "2/2" if repeat.outcome == "failed" else "1/2"

    if not checks["V5"]:
        return Verdict(status="needs_review", rule="V5", reason="weak_evidence", reproduced=reproduced, checks=checks)
    if not checks["V7"]:
        return Verdict(status="needs_review", rule="V7", reason="inconsistent", reproduced=reproduced, checks=checks)
    if reproduced == "1/2":
        return Verdict(status="needs_review", rule="V6", reason="flaky", reproduced=reproduced, checks=checks)
    if reproduced == "2/2" or deterministic:
        return Verdict(status="confirmed", rule="V1-V5+repro" if reproduced == "2/2" else "V1-V5+deterministic_signal",
                       reproduced=reproduced, checks=checks)
    return Verdict(status="needs_review", rule="V6", reason="single_observation", reproduced=reproduced, checks=checks)


def explain(tc: TestCase, case: CaseResult) -> str:
    """Deterministic one-line explanation (the model may rewrite it later; it cannot change the verdict)."""
    parts = [a.message for a in case.assertions if a.evaluated and not a.ok]
    for d in case.dup_posts:
        parts.append(f"{d.count}× POST {d.url} {d.ms_apart} ms apart")
    return "; ".join(parts) or tc.expected_result
