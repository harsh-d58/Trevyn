"""ZAP baseline (passive spider) adapter. No active-scan API or scripts are exposed here."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from .passive import Issue

# ZAP needs ~100 s on a public site (container start + 1-minute minimum spider + passive wait), so it gets its
# own budget; the other lanes run in parallel and are not slowed by it.
MAX_SECONDS = int(os.getenv("ZAP_MAX_SECONDS", "180"))
ZAP_IMAGE = "zaproxy/zap-stable"
RISK = {"3": "high", "2": "medium", "1": "low", "0": "low"}


def sanitize_report(data: dict) -> dict:
    """Keep alert metadata and scoped URL paths, not request content, parameters or tokens."""
    clean_sites = []
    for site in data.get("site", []):
        alerts = []
        for alert in site.get("alerts", []):
            safe = {key: alert[key] for key in ("pluginid", "pluginId", "alert", "name", "riskcode",
                    "riskdesc", "risk", "confidence", "confidencecode", "cweid", "wascid") if key in alert}
            instances = []
            for instance in alert.get("instances", []):
                url = str(instance.get("uri") or instance.get("url") or "")
                parsed = urlparse(url)
                instances.append({"uri": urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))})
            safe["instances"] = instances
            alerts.append(safe)
        clean_sites.append({"alerts": alerts})
    return {"site": clean_sites}


def parse_report(data: dict, allowed_hosts: set[str]) -> list[Issue]:
    """One issue per plugin, with only allowed-host instances and no URL query strings."""
    if not isinstance(data.get("site"), list):
        raise ValueError("ZAP report has no site list")
    issues: dict[str, Issue] = {}
    for site in data["site"]:
        for alert in site.get("alerts", []):
            plugin = str(alert.get("pluginid") or alert.get("pluginId") or "").strip()
            if not plugin:
                continue
            urls = []
            for instance in alert.get("instances", []):
                parsed = urlparse(str(instance.get("uri") or instance.get("url") or ""))
                if parsed.hostname and parsed.hostname.lower() in allowed_hosts:
                    urls.append(urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", "")))
            if not urls:
                continue
            risk = str(alert.get("riskcode") or "").strip()
            if risk not in RISK:
                name = str(alert.get("riskdesc") or alert.get("risk") or "").split(" ", 1)[0].lower()
                risk = {"high": "3", "medium": "2", "low": "1", "informational": "0"}.get(name, "0")
            rule = f"zap:{plugin}"
            if rule in issues:
                existing = issues[rule]
                existing.evidence["urls"] = sorted(set(existing.evidence["urls"] + urls))[:30]
                continue
            title = str(alert.get("alert") or alert.get("name") or f"ZAP alert {plugin}")[:300]
            safe = {"plugin_id": plugin, "confidence": str(alert.get("confidence") or alert.get("confidencecode") or "unknown"),
                    # ZAP writes -1 when a rule has no CWE/WASC mapping
                    "cwe": "" if str(alert.get("cweid")) in ("-1", "None") else str(alert.get("cweid") or ""),
                    "wasc": "" if str(alert.get("wascid")) in ("-1", "None") else str(alert.get("wascid") or ""),
                    "urls": sorted(set(urls))[:30]}
            issues[rule] = Issue(rule, "security", RISK[risk], title,
                                 str(alert.get("desc") or alert.get("description") or title)[:500],
                                 urlparse(urls[0]).path or "/", safe)
    return list(issues.values())


async def run_baseline(url: str, out_dir: Path, allowed_hosts: set[str]) -> tuple[Path | None, list[Issue], str]:
    """Returns report, parsed issues, and a lane note. The caller records evidence and emits lane events."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.hostname.lower() not in allowed_hosts:
        return None, [], "target is outside the project's allowlist"
    if not shutil.which("docker"):
        return None, [], "Docker unavailable; built-in P1-P9 checks remain active"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / "zap-report.json"
    # Docker Desktop resolves the host's localhost via host.docker.internal. This only changes the transport
    # address of an already-authorised local target; findings are still tied to the project's URL.
    scan_url = url
    scan_hosts = set(allowed_hosts)
    if parsed.hostname in {"localhost", "127.0.0.1"} and os.name == "nt":
        scan_url = urlunparse((parsed.scheme, f"host.docker.internal:{parsed.port}" if parsed.port else "host.docker.internal",
                               parsed.path, "", parsed.query, ""))
        scan_hosts.add("host.docker.internal")
    with tempfile.TemporaryDirectory(prefix="trevyn-docker-") as config:
        Path(config, "config.json").write_text("{}", encoding="utf-8")
        env = {**os.environ, "DOCKER_CONFIG": config}
        container = f"trevyn-zap-{uuid.uuid4().hex[:12]}"
        args = ["docker", "run", "--rm", "--pull=never", "--name", container,
                "--mount", f"type=bind,src={out_dir.resolve()},dst=/zap/wrk",
                os.getenv("ZAP_IMAGE", ZAP_IMAGE), "zap-baseline.py", "-t", scan_url, "-m", "1", "-T", "1",
                "-J", report.name, "-I"]
        try:
            proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.DEVNULL,
                                                        stderr=asyncio.subprocess.PIPE, env=env)
            try:
                _, err = await asyncio.wait_for(proc.communicate(), timeout=MAX_SECONDS)
            except TimeoutError:
                proc.kill()
                await proc.wait()
                try:
                    cleanup = await asyncio.create_subprocess_exec("docker", "rm", "-f", container,
                                                                   stdout=asyncio.subprocess.DEVNULL,
                                                                   stderr=asyncio.subprocess.DEVNULL, env=env)
                    await asyncio.wait_for(cleanup.wait(), timeout=5)
                except (OSError, TimeoutError):
                    pass
                report.unlink(missing_ok=True)
                return None, [], f"ZAP baseline exceeded {MAX_SECONDS} seconds"
        except OSError:
            return None, [], "Docker could not start ZAP"
    if not report.is_file():
        reason = (err or b"").decode(errors="replace").lower()
        if "daemon" in reason or "unable to start" in reason or "docker_engine" in reason:
            return None, [], "Docker engine is not running (start Docker Desktop); built-in P1-P9 checks remain active"
        if "no such image" in reason or "unable to find image" in reason:
            return None, [], f"ZAP image missing: run `docker pull {os.getenv('ZAP_IMAGE', ZAP_IMAGE)}`"
        return None, [], "ZAP did not produce a JSON report"
    try:
        data = sanitize_report(json.loads(report.read_text(encoding="utf-8")))
        report.write_text(json.dumps(data), encoding="utf-8")
        issues = parse_report(data, scan_hosts)
        if scan_url != url:  # report the project's own address, not Docker's transport alias
            alias, real = urlparse(scan_url).netloc, parsed.netloc
            for issue in issues:
                issue.evidence["urls"] = [u.replace(f"//{alias}", f"//{real}", 1) for u in issue.evidence["urls"]]
    except (OSError, ValueError, TypeError):
        report.unlink(missing_ok=True)
        return None, [], "ZAP report could not be parsed"
    return report, issues, f"{len(issues)} alert types from passive baseline"
