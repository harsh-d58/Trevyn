# Trevyn codebase audit — 25 October 2026

This is a read-only review of the current working tree (including staged and unstaged changes), except for temporary generated-check output restored after comparison. No application fix was made in this audit. The findings below distinguish reproduced behavior from source-level risks.

## Checks run

| Check | Result |
| --- | --- |
| Python tests | 115 passed; four pytest collection warnings for the imported `TestCase` class |
| CI Python Ruff gate (`services workers packages scenarios --select F,E9`) | Passed |
| Full Ruff scan | 186 diagnostics; 62 `B008` FastAPI `Depends` warnings, 34 import-order warnings, 25 broad-exception warnings; no new F/E9 failure in the CI scope |
| Web TypeScript, ESLint, legacy-fixture guard, production build | Passed |
| Production browser sweep | 22/22 routes returned HTTP 200 at 1440 px, with no page errors or horizontal overflow |
| Contract schema regeneration and diff | Failed: `page-map`, `site-map`, `runner-job`, and `runner-result` tracked schemas differ from the current contracts |
| OPA tests | Not run: Docker daemon access was denied in this environment |
| Dependency/advisory scan | Not run; no current advisory database was available for a reliable local result |

The browser sweep checks route loading, not every interaction or whether displayed data is correct. The Python suite uses mocks for several integrations and does not replace a real end-to-end run with Supabase, Redis/Celery, OPA, GitHub, scanners, and object storage.

## High priority findings

1. **Manifest integrity can be asserted with an arbitrary key (reproduced).** `services/api/trevyn_api/manifest.py:74-89` verifies a caller-supplied public key and combines that result with a database-content match. I fetched the saved RUN-2500 manifest, signed the unchanged content with a freshly generated key, and the API returned `signature_valid: true`, `matches_database: true`, and `integrity_verified: true`. Bind verification to the server's trusted public key or published key identity.

2. **Production approval obligation is not enforced (source confirmed).** `services/api/trevyn_api/policy.py:24-27` emits `requires_approval:production` for side effects, but `services/api/trevyn_api/main.py:320-332` only records it. `workers/orchestrator/trevyn_orch/graph.py:133-145` gates only cases marked high risk. A low/medium side-effect case in an environment marked production can run without the promised approval. API-created environments default to `is_production=False`, and no environment setter was found, so ordinary API-created projects currently cannot exercise the production gate.

3. **Browser egress can include internal hosts (source confirmed).** `services/api/trevyn_api/main.py:122` accepts arbitrary extra `allowed_domains`. The browser guard in `workers/playwright-runner/trevyn_runner/runner.py:153-161` checks only the requested hostname against that list. The public base URL is checked for private addresses, but an additional allowed hostname can be an internal host. Validate every allowed host and enforce resolved-IP restrictions at request time.

4. **Supabase-authenticated server pages cannot fetch live API data (source confirmed; conditional on `AUTH_MODE=supabase`).** `apps/web/lib/api.ts:21` sends no bearer token from the server. Server components including `apps/web/components/quality/run-result-view.tsx:120-123` and `apps/web/lib/scope-server.ts:6-27` depend on that fetch, and `tryApi` converts 401 responses to `null`. A browser session may be logged in while the initial live dashboard and quality pages show empty/error states.

5. **Single-run slot is not atomic (source confirmed).** `services/api/trevyn_api/runs.py:305-335` checks for a blocker without atomically claiming a slot, so concurrent queued runs can both proceed. Approval resume and `services/api/trevyn_api/repairs.py:176-203` regression execution bypass that check. This can exceed the intended worker and database capacity.

## Medium priority findings

6. **Public-project hook mismatch.** `services/api/trevyn_api/main.py:116-126` accepts `hook_url`; lines 236-243 plan as though the hook is usable and can skip site discovery. `services/api/trevyn_api/runs.py:269` deliberately removes it for non-local execution. Such plans can contain reset/database assertions that cannot execute. Use one consistent capability check during project creation, planning, and execution.

7. **UI marks uncertain or unevaluated checks as successful or waiting.** `apps/web/components/quality/ui-run-result.tsx:39-43` maps `warn` and `inconclusive` verdicts to `waiting`; its summary can therefore say all recorded checks matched. At line 157, any assertion status other than `failed`, including `inconclusive`, appears as green “Matched.” The backend emits inconclusive for checks not evaluated after a failed step.

8. **Contract schemas are stale and CI contracts job fails.** Running `python -m trevyn_contracts` changed four tracked schemas. `.github/workflows/ci.yml` runs that generator and then `git diff --exit-code schemas`; this branch would fail that gate until regenerated schemas are committed. The audit restored the original tracked files after recording the result.

9. **Approval resume can be lost.** `services/api/trevyn_api/runs.py:361-380` returns normally if the matching graph checkpoint interrupt does not appear within 30 seconds, although approval is already committed. `reap_stale` excludes `AWAITING_APPROVAL` runs, so the run can remain parked without an automatic retry.

10. **Display IDs can collide under concurrent inserts.** `services/api/trevyn_api/runs.py:85-91` calculates the next ID from a separate read transaction; concurrent writers can choose the same ID and hit the unique constraint. The event sequence allocator has a retry, but this display-ID allocator does not.

11. **IPv4-mapped IPv6 private addresses pass URL validation.** `services/api/trevyn_api/targets.py:20-33` does not normalize IPv4-mapped IPv6 addresses before comparing networks. Direct checks of loopback and metadata mapped forms returned no validation error. Network-stack behavior determines exploitability; DNS is also checked only before a browser session, not per request.

12. **Repository scan can report partial success as complete.** `workers/orchestrator/trevyn_orch/repo_scan.py:212-237` can return notes containing “timed out” or “unreadable,” but `workers/orchestrator/trevyn_orch/pipeline.py:250-253` does not classify those words as partial when the other scanner succeeds.

13. **Declared test time budgets are not enforced.** `packages/contracts/trevyn_contracts/__init__.py:44` defines `timeout_budget_s`, but no service or runner uses it. Individual browser actions have timeouts; a whole case can overrun its declared budget and hold the run slot.

14. **Project-level access isolation is absent if projects have separate members.** `services/api/trevyn_api/auth.py:77-84` resolves membership against only the oldest project; project, run, finding, and evidence routes do not filter by a requester's project membership. This is a boundary defect if the product intends project-specific teams. If all projects belong to one shared workspace, document that model and use workspace-level roles instead.

## Lower priority findings

15. `services/api/trevyn_api/plans_ext.py:61` calls `max()` after accepting an empty edited test-case list, producing HTTP 500 instead of a validation response.
16. `apps/web/lib/live.tsx:128` caps recent events at 12 while `apps/web/components/shell/top-bar.tsx:32` uses array length to detect new notifications; updates can stop after the list fills.
17. `services/api/trevyn_api/policy.py:14-15` accepts wildcard host entries, but `workers/playwright-runner/trevyn_runner/runner.py:155-161` requires an exact host string, so policy-approved subdomains can fail in the browser.
18. `apps/web/components/runs/runs-view.tsx:48-54` displays a date-filter chip without applying the date filter to live run rows.
19. `AUTH_MODE=off` is the default (`services/api/trevyn_api/auth.py:27,90`), granting local-owner privileges to every caller. This is a deployment configuration hazard if the API is exposed beyond a trusted machine.

## Recommended order

1. Fix the manifest trust anchor and enforce policy approval obligations.
2. Close internal-network egress and decide the intended project authorization boundary.
3. Make server-side authenticated API reads work, then fix uncertain verdict labels.
4. Make run-slot acquisition and display-ID allocation atomic; repair approval resume recovery.
5. Align hook capability checks and scanner status reporting.
6. Regenerate and commit contract schemas, then add focused regression tests for the failures above.

Existing staged and unstaged user changes were not reset or committed. Temporary audit outputs are in `.build/`.
