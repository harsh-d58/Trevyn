import json
from pathlib import Path

from trevyn_orch.lighthouse import parse_report, parse_vitals


FIXTURES = Path(__file__).parent / "fixtures"


def test_saved_lighthouse_report():
    summary, issues = parse_report(json.loads((FIXTURES / "lighthouse_report.json").read_text()),
                                   "https://example.test/")
    assert summary["score"] == 73
    assert summary["metrics"]["LCP"]["status"] == "failed"
    assert summary["metrics"]["CLS"]["status"] == "passed"
    assert summary["opportunities"][0]["saving_ms"] == 450
    assert [issue.rule for issue in issues] == ["lighthouse:LCP"]


def test_saved_web_vitals_report():
    rows, issues = parse_vitals(json.loads((FIXTURES / "web_vitals.json").read_text()))
    assert {row["metric"]: row["status"] for row in rows} == {
        "LCP": "failed", "CLS": "passed", "INP": "not run", "TTFB": "passed"}
    assert [issue.rule for issue in issues] == ["web-vitals:LCP"]


def test_stored_report_keeps_scores_not_page_content():
    from trevyn_orch.lighthouse import parse_report, sanitize_report
    raw = {"lighthouseVersion": "12", "requestedUrl": "https://app.test/account?token=abc", "finalUrl": "https://app.test/account?token=abc",
           "categories": {"performance": {"score": 0.91, "auditRefs": [{"id": "x"}]}},
           "audits": {"largest-contentful-paint": {"id": "largest-contentful-paint", "title": "LCP", "score": 0.9, "numericValue": 1800},
                      "final-screenshot": {"id": "final-screenshot", "details": {"type": "screenshot", "data": "data:image/jpeg;base64,AAAA"}},
                      "network-requests": {"id": "network-requests", "details": {"type": "table", "items": [{"url": "https://app.test/api/me?session=s3cret"}]}},
                      "render-blocking-resources": {"id": "render-blocking-resources", "title": "Eliminate render-blocking",
                                                    "details": {"type": "opportunity", "overallSavingsMs": 300, "items": [{"url": "https://app.test/a.css?v=1"}]}}}}
    clean = sanitize_report(raw)
    text = json.dumps(clean)
    assert "token=abc" not in text and "s3cret" not in text and "data:image" not in text and "a.css" not in text
    summary, _ = parse_report(clean, "https://app.test/account")
    assert summary["score"] == 91 and summary["metrics"]["LCP"]["value"] == 1800
    assert summary["opportunities"] == [{"name": "Eliminate render-blocking", "saving_ms": 300}]
