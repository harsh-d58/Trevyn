import json
from pathlib import Path

from trevyn_orch.axe import parse_report as parse_axe
from trevyn_orch.compat import parse_matrix


FIXTURES = Path(__file__).parent / "fixtures"


def test_saved_compat_matrix():
    rows = parse_matrix(json.loads((FIXTURES / "compat_matrix.json").read_text()))
    assert [row["status"] for row in rows] == ["passed", "failed", "not run"]


def test_saved_axe_report():
    issues = parse_axe(json.loads((FIXTURES / "axe_report.json").read_text()))
    assert len(issues) == 1
    assert issues[0].rule == "axe:color-contrast" and issues[0].severity == "medium"
    assert issues[0].evidence["node_count"] == 2


def test_errored_browser_runs_are_kept_with_their_reason():
    from trevyn_orch.compat import parse_matrix
    rows = parse_matrix({"rows": [{"case": "TC-1", "browser": "firefox", "status": "errored", "note": "step error: Timeout"},
                                  {"case": "TC-2", "browser": "webkit", "status": "not run", "note": "side effects or risk"}]})
    assert [r["status"] for r in rows] == ["errored", "not run"] and rows[0]["note"].startswith("step error")
