"""Deterministic diff guard (blueprint Step 6): a patch must not weaken the tests, hide secrets or sprawl."""
from __future__ import annotations

import re

TEST_PATH = re.compile(r"(^|/)(tests?|e2e|__tests__)/|\.(spec|test)\.[jt]sx?$|_test\.py$|(^|/)test_[^/]+\.py$")
SECRET = re.compile(r"(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"\s]{8,})")
MAX_LINES, MAX_FILES = 300, 10


def check(diff: str) -> dict:
    files = re.findall(r"^\+\+\+ b/(.+)$", diff, re.M)
    added = [ln for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++")]
    removed = [ln for ln in diff.splitlines() if ln.startswith("-") and not ln.startswith("---")]
    flags = []
    if tests := [f for f in files if TEST_PATH.search(f)]:
        flags.append({"code": "touches_tests", "level": "review",
                      "message": f"Edits test files, which may weaken the check: {', '.join(tests)}"})
    if len(added) + len(removed) > MAX_LINES or len(files) > MAX_FILES:
        flags.append({"code": "too_large", "level": "refuse",
                      "message": f"More than {MAX_LINES} changed lines or {MAX_FILES} files. Ask for a narrower fix."})
    if any(SECRET.search(ln) for ln in added):
        flags.append({"code": "secret_in_diff", "level": "refuse", "message": "The patch adds something that looks like a secret."})
    if not files:
        flags.append({"code": "empty_diff", "level": "refuse", "message": "The patch has no changed files."})
    return {"files": files, "added": len(added), "removed": len(removed), "flags": flags,
            "refused": any(f["level"] == "refuse" for f in flags), "requires_review": any(f["level"] == "review" for f in flags)}
