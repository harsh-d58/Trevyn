import json
from pathlib import Path

import pytest

from trevyn_orch.zap import parse_report, run_baseline, sanitize_report


SAMPLE = Path(__file__).parent / "fixtures" / "zap_report.json"


def test_zap_report_is_scoped_and_redacts_url_queries():
    issues = parse_report(json.loads(SAMPLE.read_text()), {"example.test"})
    assert {issue.rule for issue in issues} == {"zap:10038", "zap:10020"}
    csp = next(issue for issue in issues if issue.rule == "zap:10038")
    assert csp.severity == "medium" and csp.evidence["cwe"] == "693"
    assert csp.evidence["confidence"] == "High"
    assert all("token=" not in url for url in csp.evidence["urls"])


def test_zap_report_evidence_is_redacted():
    sample = json.loads(SAMPLE.read_text())
    sample["site"][0]["alerts"][0]["evidence"] = "private-cookie"
    sanitized = json.dumps(sanitize_report(sample))
    assert "private-cookie" not in sanitized and "token=" not in sanitized


@pytest.mark.asyncio
async def test_zap_rejects_target_outside_allowlist(tmp_path):
    report, issues, note = await run_baseline("https://outside.test", tmp_path, {"example.test"})
    assert report is None and issues == [] and "allowlist" in note
