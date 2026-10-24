import asyncio
import json
from pathlib import Path

from trevyn_api.insights import _read_har
from trevyn_runner.runner import sanitize_har


FIXTURE = Path(__file__).parent / "fixtures" / "network.har"


def test_har_parser_reports_measured_timings():
    rows = asyncio.run(_read_har(str(FIXTURE)))
    assert [(r["path"], r["status"], r["t"], r["ms"]) for r in rows] == [
        ("/page", 200, 0, 123), ("/api/items", 404, 200, 50)]


def test_har_sanitizer_removes_credentials_and_bodies(tmp_path):
    dest = tmp_path / "capture.har"
    sample = json.loads(FIXTURE.read_text())
    entry = sample["log"]["entries"][0]
    entry["request"]["url"] += "?token=sensitive"
    entry["request"]["headers"] = [{"name": "X-Private", "value": "sensitive"}]
    entry["request"]["postData"] = {"text": "sensitive"}
    entry["response"]["content"]["text"] = "sensitive"
    dest.write_text(json.dumps(sample))
    sanitize_har(dest)
    raw = dest.read_text()
    assert "sensitive" not in raw
    assert json.loads(raw)["log"]["entries"][0]["response"]["content"]["size"] == 99
