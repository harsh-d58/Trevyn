"""Scanner findings state the rule as Expected and the observation as Actual, never the same text twice."""
from trevyn_orch.expectations import describe
from trevyn_orch.passive import Issue


def issue(rule, ev, category="security", title="t", message="m"):
    return Issue(rule, category, "medium", title, message, "/", ev)


def test_every_engine_gives_distinct_expected_and_actual():
    cases = [
        issue("P1", {"url": "https://a.test/", "header": "content-security-policy"}),
        issue("P8", {"case": "TC-1", "first": "TypeError: x is undefined", "count": 2}, "ui"),
        issue("zap:10038", {"plugin_id": "10038", "cwe": "693", "confidence": "3", "urls": ["https://a.test/"]}, title="CSP Header Not Set"),
        issue("axe:label", {"impact": "critical", "wcag": ["wcag2a"], "node_count": 3}, "accessibility", "Form elements must have labels"),
        issue("web-vitals:LCP", {"metric": "LCP", "value": 4100.5, "budget": 2500.0, "path": "/app"}, "perf"),
        issue("osv:npm/lodash", {"package": "lodash", "version": "4.17.4", "fixed_version": "4.17.21",
                                 "aliases": ["CVE-2018-3721"], "advisories": [{}, {}]}),
        issue("gitleaks:github-pat", {"rule": "github-pat", "file": "src/a.js", "line": 3}),
    ]
    for i in cases:
        expected, actual = describe(i)
        assert expected and actual and expected != actual, i.rule
    assert "4100.5 ms on /app" in describe(cases[4])[1]
    assert "fixed in 4.17.21" in describe(cases[5])[1] and "CVE-2018-3721" in describe(cases[5])[1]
    assert "TypeError" in describe(cases[1])[1]
