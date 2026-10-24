import asyncio
import json
from pathlib import Path

from trevyn_orch.repo_scan import parse_gitleaks, parse_osv, scan


FIXTURES = Path(__file__).parent / "fixtures"


def test_saved_osv_report():
    issues = parse_osv(json.loads((FIXTURES / "osv_report.json").read_text()))
    assert len(issues) == 1
    assert issues[0].rule.startswith("osv:") and issues[0].evidence["id"] == "GHSA-aaaa-bbbb-cccc"
    assert issues[0].evidence["aliases"] == ["CVE-2025-0001"]
    assert issues[0].evidence["fixed_version"] == "1.2.0"


def test_osv_groups_advisories_per_package_with_real_severity_and_fix():
    """Shapes taken from a real OSV-Scanner 2.7 report: CVSS arrives as a vector string, the numeric score is in
    groups[].max_severity, and the fixed version must come from this package's affected range."""
    vuln = lambda vid, cve, fixed, label: {"id": vid, "aliases": [cve], "summary": f"{vid} summary",
        "database_specific": {"severity": label}, "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L"}],
        "affected": [{"package": {"name": "other-pkg"}, "ranges": [{"events": [{"fixed": "99.0.0"}]}]},
                     {"package": {"name": "adm-zip"}, "ranges": [{"events": [{"introduced": "0"}, {"fixed": fixed}]}]}]}
    data = {"results": [{"source": {"path": "/x/package-lock.json"}, "packages": [{
        "package": {"name": "adm-zip", "version": "0.4.7", "ecosystem": "npm"},
        "groups": [{"ids": ["GHSA-1"], "aliases": ["CVE-1"], "max_severity": "5.3"}],
        "vulnerabilities": [vuln("GHSA-1", "CVE-1", "0.4.9", "MODERATE"), vuln("GHSA-2", "CVE-2", "0.4.11", "HIGH")]}]}]}
    issues = parse_osv(data)
    assert len(issues) == 1  # one finding per package, not per advisory
    ev = issues[0].evidence
    assert ev["fixed_version"] == "0.4.11"  # the highest fix across advisories, from this package's range
    assert {a["id"]: a["severity"] for a in ev["advisories"]} == {"GHSA-1": "medium", "GHSA-2": "high"}
    assert issues[0].severity == "high" and ev["aliases"] == ["CVE-1", "CVE-2"]


def test_gitleaks_never_persists_secret_fields():
    issues, report = parse_gitleaks(json.loads((FIXTURES / "gitleaks_report.json").read_text()))
    assert len(issues) == 1 and issues[0].rule == "gitleaks:generic-api-key"
    assert "super-sensitive-value" not in json.dumps(report)
    assert "super-sensitive-value" not in json.dumps(issues[0].evidence)


def test_repository_scanner_rejects_non_github_url(tmp_path):
    reports, note = asyncio.run(scan("https://evil.test/repo", "a" * 40, tmp_path))
    assert reports == [] and "invalid" in note


def test_gitleaks_paths_are_relative_to_the_checkout(tmp_path):
    secret_file = tmp_path / "src" / "config.js"
    issues, report = parse_gitleaks([{"RuleID": "github-pat", "File": str(secret_file), "StartLine": 3,
                                      "Secret": "ghp_x", "Match": "token = ghp_x"}], tmp_path)
    assert report[0]["file"] == "src/config.js" and str(tmp_path) not in json.dumps(report)
    assert "ghp_x" not in json.dumps(report) + json.dumps(issues[0].evidence)
