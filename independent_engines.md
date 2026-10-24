# Independent quality engines — progress

Updated: 25 October 2026. This file tracks the five rule-based lanes requested for Trevyn. Results come from scanners and browser measurements; no LLM decides their pass/fail outcome. All changes are uncommitted; no push or commit was run.

## Current state: all five engines verified with real tools

| Feature | Verified for real | Fixes made during verification |
|---|---|---|
| F1 · ZAP passive security | **Docker ZAP baseline** on the demo shop: 41 s, 5 alert types, including **CSP not set (CWE-693)** and **missing anti-clickjacking header (CWE-1021)**, plus anti-CSRF tokens missing on login/register. On todomvc.com: 103 s, 14–15 alert types. The stored report has no query strings or bodies. | Findings now show the project's URL, not Docker's `host.docker.internal` alias. ZAP's `cwe=-1` is stored as "no CWE". ZAP gets its own budget (`ZAP_MAX_SECONDS`, default **180 s**), because it needs ~100 s on a public site; 120 s timed out inside a full run. Status reads "issues found" instead of "failed". |
| F2 · Lighthouse + web-vitals | Lighthouse lane on the demo shop: score 100, LCP ~200 ms, CLS 0. An unmeasurable page is reported with Lighthouse's reason (`/cart not measured (ERRORED_DOCUMENT_REQUEST)`: it returns 401). | **Egress:** the dead-proxy flags (`--proxy-server` + `--proxy-bypass-list=<-loopback>;<allowlist>`) are verified: only the allowlisted host loads; raw IPs (`1.1.1.1`, `93.184.215.14`), other hosts and a non-allowlisted `127.0.0.1` fail with `ERR_PROXY_CONNECTION_FAILED`. **Stored data:** Lighthouse JSON is sanitised to scores, metrics and opportunity savings. Screenshots, request URLs, DOM snippets and page text are dropped (8 KB stored per page). An unparseable raw report is deleted, never kept. |
| F3 · Firefox/WebKit/mobile + axe-core | Playwright Firefox + WebKit installed. Real matrix on TodoMVC: **4 cases × Firefox, WebKit, iPhone 13 = 12/12 passed** in ~65 s. axe-core results stored in the UI view. | `PLAYWRIGHT_CHANNEL` (e.g. `chrome`) is now applied only to Chromium; it made Firefox/WebKit fail to launch. A case that runs but errors is shown as **`errored` with the step error** (it was "not run" with no reason). The lane warns only when a browser or the time budget fails, not when unsafe cases are skipped by design. |
| F4 · HAR + trace | HAR + trace per case (from the earlier session); the Network page follows the selected run, with per-case filter. | The Network header names the run (`RUN-2483 · name`) instead of a uuid fragment; Copilot does the same. The Network view no longer copies props into state inside an effect (ESLint `set-state-in-effect` error). |
| F5 · OSV-Scanner + Gitleaks | **OSV-Scanner 2.7.0 + Gitleaks 8.30.1** in `var/tools`, SHA-256 checked against the official release checksum files. Real scans: `snyk-labs/nodejs-goof` gave 123 vulnerable packages (e.g. lodash 4.17.4: CVE-2018-3721, CVE-2018-16487, upgrade to the fixed version); `tastejs/todomvc` @ ff43b02 gave 166 vulnerable packages and 1 possible secret (redacted, path `examples/emberjs/.../chunk...js.map`). Planted fake Stripe/GitHub tokens were detected and **never stored**. | **OSV parser:** one finding **per package** (was one per advisory: 270 vs 123), every advisory listed with summary, CVE and fixed version. **Severity bug fixed:** CVSS came as a vector string, and `MODERATE` was mapped to low; now it uses OSV's numeric `max_severity`. **Fixed version** is read from this package's own affected range. **Gitleaks** paths are repo-relative (no temp/machine path). Scanners are found via env (`OSV_SCANNER_BIN`, `GITLEAKS_BIN`), PATH or `var/tools`. **Windows cleanup:** read-only git objects made the temp checkout raise `PermissionError` and discard results; it is now removed with retries and never loses results. Repo budget is `REPO_SCAN_MAX_SECONDS` (default 180). OSV errors are labelled honestly ("timed out after N s", "output unreadable"). |

## End-to-end and browser acceptance

- **Golden path** (demo shop, all lanes in one LangGraph run): passed in 1 m 39 s. UI 3/3, passive 3 issues, Lighthouse 1/1, ZAP 5 alerts, repo lane "not applicable" (no repo), compat "not run: side effects or risk" (all cases create orders: correct). DEF-142-class double order confirmed.
- **Grey-box run** (TodoMVC Vue + `tastejs/todomvc`, second project): AI plan `model+sitemap+repo`, UI 5/5 passed, ZAP 15 alerts, Lighthouse 2/2, OSV 166 packages + Gitleaks 1 (on the run before the cleanup fix).
- **Two-project browser check** (`qe_scope.py`): pick project + run in the top bar for RUN-2481 (demo shop), then RUN-2483 (TodoMVC). **All 7 pages pass**: UI testing, API testing, Performance, Security, Compatibility, Network & traces, Planner. Each shows its run id, changes when the run changes, has no demo text, and has no page errors.
- **Plan creation fix** (found by the second-project run): the site scan was flushed but not committed while the AI planned, so recording the AI cost in another session deadlocked on SQLite (`database is locked`). The scan is now committed immediately (`main.site_snapshot`).
- **Security page:** big diagrams no longer overflow their card (natural height up to 600 px, then scroll).
- **Checks:** 108 Python tests (new: grouped OSV, Gitleaks relative paths, Lighthouse sanitising, errored compat rows), Ruff F/E9, TypeScript, **full ESLint**, Next production build.

## Remaining limits (not bugs)

1. Compatibility replays only read-only cases (no typing/submitting), so AI journeys that type text show "not run: side effects or risk". This is by design for live sites.
2. Gitleaks flags minified build files (`.js.map`) as "possible secrets"; review before acting.
3. The Security page "Summary" card prints the rules object as raw JSON (the same data is shown properly in the Rules table above it). This is cosmetic.
4. The scanner binaries in `var/tools` are local to this machine (gitignored). For CI or a new machine, install them or set `OSV_SCANNER_BIN` / `GITLEAKS_BIN`. The ZAP image is `zaproxy/zap-stable` (≈3.8 GB).

No Git commit or push was performed. The user should review the diff and run Git commands manually.
