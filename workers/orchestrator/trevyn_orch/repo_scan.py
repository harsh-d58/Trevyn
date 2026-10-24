"""Read-only scanners for a verified, pinned public GitHub checkout."""
from __future__ import annotations

import asyncio
import json
import os
import re
import logging
import shutil
import stat
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

from .passive import Issue

log = logging.getLogger("trevyn.repo_scan")

GITHUB_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
LOCAL_TOOLS = Path(__file__).resolve().parents[3] / "var" / "tools"  # gitignored; workers may not inherit a user PATH


def _tool(name: str, env_var: str) -> str | None:
    """Scanner binary: explicit env var, then PATH, then the repo's var/tools folder."""
    explicit = os.getenv(env_var)
    if explicit and Path(explicit).is_file():
        return explicit
    local = next((p for p in (LOCAL_TOOLS / f"{name}.exe", LOCAL_TOOLS / name) if p.is_file()), None)
    return shutil.which(name) or (str(local) if local else None)


def _version_key(v: str) -> tuple:
    """Orders "1.2.10" after "1.2.9" (numeric parts; anything else sorts as text)."""
    return tuple((0, int(x)) if x.isdigit() else (1, x) for x in re.split(r"[.+-]", v))


def _severity(score: float | None, stated: str) -> str:
    if score is not None:
        return "high" if score >= 7 else "medium" if score >= 4 else "low"
    return "high" if stated in {"critical", "high"} else "medium" if stated in {"moderate", "medium"} else "low"


def parse_osv(data: dict) -> list[Issue]:
    """One finding per vulnerable package@version (as dependency scanners report it), listing every advisory with its
    summary, CVE aliases and the version that fixes it. Severity comes from OSV-Scanner's numeric per-group
    `max_severity` (CVSS base score); the advisory's own label (LOW/MODERATE/HIGH/CRITICAL) is the fallback."""
    if not isinstance(data.get("results"), list):
        raise ValueError("OSV JSON has no results")
    issues = []
    seen = set()
    for result in data["results"]:
        source = Path(str((result.get("source") or {}).get("path") or "")).name
        for entry in result.get("packages", []):
            package = entry.get("package") or {}
            name, version = str(package.get("name") or ""), str(package.get("version") or "")
            if not name or (source, name, version) in seen:
                continue
            seen.add((source, name, version))
            scores: dict[str, float] = {}
            for group in entry.get("groups") or []:
                try:
                    score = float(group.get("max_severity"))
                except (TypeError, ValueError):
                    continue
                for gid in [*(group.get("ids") or []), *(group.get("aliases") or [])]:
                    scores[str(gid)] = score
            advisories = []
            for vuln in entry.get("vulnerabilities", []):
                vid = str(vuln.get("id") or "")
                if not vid:
                    continue
                aliases = [str(a) for a in vuln.get("aliases", [])]
                # the fix for *this* package: an advisory can cover several packages with different fixed versions
                fixed = sorted({str(ev["fixed"]) for aff in vuln.get("affected", [])
                                if str((aff.get("package") or {}).get("name") or name) == name
                                for span in aff.get("ranges", []) for ev in span.get("events", [])
                                if isinstance(ev, dict) and ev.get("fixed")}, key=_version_key)
                score = scores.get(vid) or next((scores[a] for a in aliases if a in scores), None)
                stated = str((vuln.get("database_specific") or {}).get("severity") or "").lower()
                advisories.append({"id": vid, "aliases": aliases, "summary": str(vuln.get("summary") or "")[:200],
                                   "fixed_version": fixed[-1] if fixed else None, "cvss": score,
                                   "severity": _severity(score, stated)})
            if not advisories:
                continue
            rank = ["low", "medium", "high"]
            severity = max((a["severity"] for a in advisories), key=rank.index)
            fixes = [a["fixed_version"] for a in advisories if a["fixed_version"]]
            upgrade = max(fixes, key=_version_key) if fixes else None
            cves = sorted({a for adv in advisories for a in adv["aliases"] if a.startswith("CVE-")})
            worst = max(advisories, key=lambda a: (rank.index(a["severity"]), a["cvss"] or 0))
            title = (f"{name}@{version}: {worst['summary'] or worst['id']}" if len(advisories) == 1 else
                     f"{name}@{version}: {len(advisories)} known vulnerabilities")
            detail = {"package": name, "version": version, "ecosystem": package.get("ecosystem"), "source": source,
                      "fixed_version": upgrade, "aliases": cves, "advisories": advisories[:50],
                      "id": worst["id"], "cvss": worst["cvss"]}
            message = (f"Dependency {name}@{version} ({package.get('ecosystem')}, {source}) has {len(advisories)} known "
                       f"vulnerabilit{'y' if len(advisories) == 1 else 'ies'}"
                       + (f"; upgrade to {upgrade} or later." if upgrade else "; no fixed version published."))
            issues.append(Issue(f"osv:{package.get('ecosystem') or 'pkg'}/{name}", "security", severity, title[:300], message, "/", detail))
    return issues


def parse_gitleaks(data: list[dict], root: Path | None = None) -> tuple[list[Issue], list[dict]]:
    """Whitelist only location and rule fields. Secret, Match, line text and fingerprints never persist.
    Paths are made relative to the scanned checkout so no temporary or machine path is stored."""
    if not isinstance(data, list):
        raise ValueError("Gitleaks JSON must be a list")
    issues, redacted = [], []
    for item in data:
        rule = str(item.get("RuleID") or "unknown")[:100]
        file = str(item.get("File") or "")
        if root is not None:
            try:
                file = Path(file).resolve().relative_to(root.resolve()).as_posix()
            except (OSError, ValueError):
                file = Path(file).name
        file = file[:300]
        line = item.get("StartLine")
        try:
            line = int(line)
        except (TypeError, ValueError):
            line = None
        safe = {"rule": rule, "file": file, "line": line, "secret": "[REDACTED]"}
        redacted.append(safe)
        issues.append(Issue(f"gitleaks:{rule}", "security", "high", f"Possible secret in {file}:{line or '?'}",
                            f"Gitleaks rule {rule} matched in {file}:{line or '?'}; value redacted.", "/", safe))
    return issues, redacted


async def _remove_tree(path: Path) -> None:
    """Deletes the temporary checkout. Git marks its objects read-only on Windows, and a scanner that just exited
    can hold a file briefly, so clear the flag and retry; leftovers in the temp folder are logged, not raised."""
    def unlock(func, target, _exc):
        os.chmod(target, stat.S_IWRITE)
        func(target)
    for attempt in range(5):
        try:
            shutil.rmtree(path, onexc=unlock)
            return
        except FileNotFoundError:
            return
        except OSError:
            await asyncio.sleep(0.5 * (attempt + 1))
    log.warning("temporary checkout %s could not be fully removed", path)


async def _command(args: list[str], cwd: Path, env: dict, seconds: float) -> tuple[int, bytes]:
    proc = await asyncio.create_subprocess_exec(*args, cwd=cwd, env=env, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.DEVNULL)
    try:
        output, _ = await asyncio.wait_for(proc.communicate(), timeout=max(1, seconds))
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise
    return proc.returncode, output


async def scan(url: str, sha: str, out_dir: Path) -> tuple[list[tuple[Path, list[Issue]]], str]:
    parsed = urlsplit(url)
    name = parsed.path.strip("/").removesuffix(".git")
    try:
        port = parsed.port
    except ValueError:
        return [], "repository URL or pinned SHA is invalid"
    if parsed.scheme != "https" or parsed.hostname != "github.com" or port or parsed.username or parsed.password \
            or parsed.query or parsed.fragment or not GITHUB_RE.fullmatch(name) or not SHA_RE.fullmatch(sha):
        return [], "repository URL or pinned SHA is invalid"
    git, osv, gitleaks = shutil.which("git"), _tool("osv-scanner", "OSV_SCANNER_BIN"), _tool("gitleaks", "GITLEAKS_BIN")
    if not git:
        return [], "Git unavailable"
    if not osv and not gitleaks:
        return [], "OSV-Scanner and Gitleaks unavailable"
    out_dir.mkdir(parents=True, exist_ok=True)
    # checkout + OSV's online lookups on a large repo can take minutes on a slow link; this lane runs in parallel
    deadline = time.monotonic() + int(os.getenv("REPO_SCAN_MAX_SECONDS", "180"))
    reports: list[tuple[Path, list[Issue]]] = []
    notes = []
    root = tempfile.mkdtemp(prefix="trevyn-repo-")
    try:
        checkout = Path(root)
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_LFS_SKIP_SMUDGE": "1",
               "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
        for args in ([git, "init", "-q"],
                     [git, "-c", "protocol.version=2", "fetch", "--no-tags", "--depth=1", url, sha],
                     [git, "-c", "core.symlinks=false", "checkout", "-q", "--detach", "FETCH_HEAD"]):
            try:
                code, _ = await _command(args, checkout, env, min(90, max(1, deadline - time.monotonic())))
            except TimeoutError:
                return [], "Pinned GitHub checkout timed out (slow network or very large repository)"
            if code:
                return [], "Pinned GitHub checkout failed"
        code, head = await _command([git, "rev-parse", "HEAD"], checkout, env, 3)
        if code or head.decode(errors="replace").strip() != sha:
            return [], "Checkout SHA did not match the plan"
        # Gitleaks first: local and quick. OSV queries osv.dev over the network and gets the remaining time.
        if gitleaks and deadline - time.monotonic() > 2:
            try:
                code, output = await _command([gitleaks, "dir", str(checkout), "--report-format=json",
                                               "--report-path=-", "--redact", "--no-banner", "--no-color"],
                                              checkout, env, min(60, max(1, deadline - time.monotonic())))
                if code in (0, 1):
                    issues, safe = parse_gitleaks(json.loads(output or b"[]"), checkout)
                    report = out_dir / "gitleaks-redacted.json"
                    report.write_text(json.dumps(safe), encoding="utf-8")
                    reports.append((report, issues))
                    notes.append(f"Gitleaks: {len(issues)} possible secrets")
                else:
                    notes.append("Gitleaks failed")
            except TimeoutError:
                notes.append("Gitleaks timed out after 60 s")
            except (ValueError, TypeError):
                notes.append("Gitleaks output unreadable")
            except OSError as exc:
                notes.append(f"Gitleaks could not start ({type(exc).__name__})")
        elif not gitleaks:
            notes.append("Gitleaks not installed")
        if osv:
            try:
                osv_budget = max(5.0, deadline - time.monotonic())  # Gitleaks already ran
                code, output = await _command([osv, "scan", "source", "--recursive", "--format=json", str(checkout)],
                                              checkout, env, osv_budget)
                if code in (0, 1):
                    data = json.loads(output)
                    issues = parse_osv(data)
                    report = out_dir / "osv-report.json"
                    report.write_text(json.dumps(data), encoding="utf-8")
                    reports.append((report, issues))
                    notes.append(f"OSV: {len(issues)} vulnerable packages")
                else:
                    notes.append("OSV failed")
            except TimeoutError:
                notes.append(f"OSV timed out after {osv_budget:.0f} s")
            except (ValueError, TypeError):
                notes.append("OSV output unreadable")
            except OSError as exc:
                notes.append(f"OSV could not start ({type(exc).__name__})")
        else:
            notes.append("OSV-Scanner not installed")
    finally:
        await _remove_tree(Path(root))  # a cleanup problem must never discard finished scan results
    return reports, "; ".join(notes)
