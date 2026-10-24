"""Read-only connection to public GitHub repositories; no clone or code execution in the API."""
from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

import httpx

GITHUB_API = "https://api.github.com"
SEGMENT = re.compile(r"[A-Za-z0-9_.-]{1,100}\Z")
HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "Trevyn/0.1"}


class RepositoryError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class RepositoryInfo:
    url: str
    full_name: str
    ref: str
    sha: str
    file_map: dict


def parse_github_url(url: str) -> tuple[str, str]:
    parsed = urlsplit(url.strip())
    try:
        port = parsed.port
    except ValueError as exc:
        raise RepositoryError(422, "Invalid GitHub URL port") from exc
    if (parsed.scheme != "https" or parsed.hostname != "github.com" or port is not None
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise RepositoryError(422, "Enter a public https://github.com/owner/repo URL")
    parts = parsed.path.strip("/").split("/")
    if len(parts) != 2:
        raise RepositoryError(422, "GitHub URL must name one owner and repository")
    owner, repo = parts
    repo = repo.removesuffix(".git")
    if not SEGMENT.fullmatch(owner) or not SEGMENT.fullmatch(repo) or owner in (".", "..") or repo in (".", ".."):
        raise RepositoryError(422, "Invalid GitHub owner or repository name")
    return owner, repo


async def _github(client: httpx.AsyncClient, path: str) -> dict:
    try:
        response = await client.get(GITHUB_API + path)
    except httpx.HTTPError as exc:
        raise RepositoryError(502, f"GitHub could not be reached ({type(exc).__name__})") from exc
    if response.url.host != "api.github.com":
        raise RepositoryError(502, "GitHub redirected outside its API")
    if response.status_code == 404:
        raise RepositoryError(404, "Public GitHub repository or ref not found")
    if response.status_code == 403:
        raise RepositoryError(503, "GitHub API access is limited; retry later")
    if not response.is_success:
        raise RepositoryError(502, f"GitHub returned HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise RepositoryError(502, "GitHub returned invalid JSON") from exc


def select_repo_paths(paths: list[str], site_path: str = "") -> tuple[str, list[str], list[str], list[str]]:
    """Prefer files matching the site's route and ignore checked-in dependencies/build output."""
    parts = [part for part in site_path.strip("/").split("/") if part]
    while parts and parts[-1] in ("dist", "build", "public"):
        parts.pop()
    prefix = "/".join(parts) + "/" if len(parts) > 1 else ""
    ignored = {"node_modules", "bower_components", "vendor", "dist", "build", "coverage", ".git", "site-assets"}
    clean = [path for path in paths if not any(part in ignored for part in path.split("/"))]
    test_re = re.compile(r"(^|/)(tests?|__tests__|cypress)(/|$)|(^|/)(test_|spec\.)|\.(test|spec)\.[jt]sx?$", re.IGNORECASE)
    tests = [path for path in clean if test_re.search(path) and path.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".html"))]
    tests.sort(key=lambda p: (0 if prefix and p.startswith(prefix) else 1 if p.startswith(("tests/", "cypress/")) else 2, p))
    source_ext = (".py", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html", ".css", ".go", ".java")
    source = [path for path in clean if path.endswith(source_ext) and not test_re.search(path)]
    source.sort(key=lambda p: (0 if prefix and p.startswith(prefix) else 1 if p.startswith(("src/", "app/", "apps/", "services/")) else 2, p))
    manifests = [path for path in clean if path in ("pyproject.toml", "pytest.ini", "package.json", "apps/web/package.json")
                 or (prefix and path == prefix + "package.json")]
    return prefix, source[:60], tests[:40], manifests


async def inspect_public_repo(url: str, ref: str | None = None, *, site_path: str = "") -> RepositoryInfo:
    owner, repo = parse_github_url(url)
    if ref and (len(ref) > 200 or not re.fullmatch(r"[A-Za-z0-9_./-]+", ref) or ".." in ref):
        raise RepositoryError(422, "Invalid branch or ref")
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=HEADERS) as client:
        meta = await _github(client, f"/repos/{owner}/{repo}")
        if meta.get("private") or meta.get("visibility") not in (None, "public"):
            raise RepositoryError(422, "Only public repositories are supported")
        full_name = meta.get("full_name", "")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name):
            raise RepositoryError(502, "GitHub returned an invalid repository name")
        selected_ref = ref or meta.get("default_branch")
        if not selected_ref:
            raise RepositoryError(422, "Repository has no default branch")
        encoded_name = "/".join(quote(part, safe="") for part in full_name.split("/"))
        commit = await _github(client, f"/repos/{encoded_name}/commits/{quote(selected_ref, safe='')}")
        sha = commit.get("sha", "")
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise RepositoryError(502, "GitHub returned an invalid commit")
        tree_sha = ((commit.get("commit") or {}).get("tree") or {}).get("sha", "")
        if not re.fullmatch(r"[0-9a-f]{40}", tree_sha):
            raise RepositoryError(502, "GitHub returned an invalid file tree")
        tree = await _github(client, f"/repos/{encoded_name}/git/trees/{tree_sha}?recursive=1")
        paths = [item["path"] for item in tree.get("tree", []) if item.get("type") == "blob"
                 and isinstance(item.get("path"), str) and len(item["path"]) <= 240]
        site_prefix, source_paths, test_paths, manifests = select_repo_paths(paths, site_path)
        commands = []
        if test_paths and any(path in manifests for path in ("pyproject.toml", "pytest.ini")):
            commands.append("python -m pytest -q")
        if "package.json" in manifests:
            package = await _github(client, f"/repos/{encoded_name}/contents/package.json?ref={sha}")
            if package.get("encoding") == "base64":
                try:
                    scripts = json.loads(base64.b64decode(package.get("content", ""))).get("scripts", {})
                    if isinstance(scripts.get("test"), str):
                        commands.append("npm test")
                except (ValueError, TypeError, KeyError):
                    pass
        return RepositoryInfo(
            url=f"https://github.com/{full_name}", full_name=full_name, ref=selected_ref, sha=sha,
            file_map={"repository": full_name, "commit": sha, "file_count": len(paths), "tree_truncated": bool(tree.get("truncated")),
                      "site_prefix": site_prefix, "manifests": manifests, "test_files": test_paths,
                      "source_files": source_paths,
                      "suggested_test_commands": commands},
        )
