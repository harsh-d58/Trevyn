# Frontend and backend integration audit

Audit date: 24 October 2026. Scope: all 23 workspace page templates, the login page, shared shell controls, the API contracts, and application testing through a URL, localhost, or GitHub.

## Result

**The browser testing core works, but the dashboard is only partly connected. The application cannot yet reliably onboard and test any application through its UI.**

- **10/23 workspace pages (43.5%) contain an API-backed feature.** Each also has limitations or fixture content. This is a page wiring count, not a completion or code coverage percentage.
- **13/23 workspace pages (56.5%) use fixture data and/or simulated actions for their main feature.** Following a link into another page does not count as a backend connection.
- Login is counted separately: Supabase client calls exist, but a real Supabase login was not tested. Authentication breaks several other frontend paths.
- No defensible percentage of application scenarios or threats covered can be calculated without an agreed scenario inventory and coverage instrumentation.

## What was actually run

| Check | Result | Evidence |
|---|---|---|
| Clean frontend installation | Passed after lockfile repair; 691 packages installed | `apps/web/package-lock.json` |
| Python installation | Python 3.12.14 virtual environment, declared runtime/dev dependencies, editable Trevyn, Chromium headless shell | `.venv/`, `var/playwright/` |
| Python lock consistency | `uv lock --check --offline` passed; existing versions retained, missing moto dependencies added | `uv.lock` |
| Frontend lint and legacy styling guard | Passed | `npm run lint`, `npm run check:legacy` |
| Production build and TypeScript | Exit code 0; prerender cache errors were also logged, so this was not a clean diagnostic run | `apps/web/app/(workspace)/layout.tsx:19`, `apps/web/lib/live-data.ts:10` |
| Backend lint | Passed | `ruff check services workers packages scenarios --select F,E9` |
| Backend unit suite | **57 passed**, two collection warnings | [JUnit output](var/audit-pytest.xml) |
| Golden path against ShopFlow | Passed: duplicate-order finding confirmed with 12 evidence items | [Log](var/audit/golden-path.log) |
| Demo repair/regression loop | All five final assertions passed, including before/after comparison and manifest integrity | [Log](var/audit/repair-loop.log) |
| Additional API acceptance checks | **28 passed / 33**; five missing or broken capabilities reproduced | [Results](var/audit/api-results.json) |
| Browser route sweep | **24/24 HTTP 200**; **22/24** had no detected console/layout errors | [Results](var/audit/browser-results.json), [screenshots](var/audit/screenshots/) |
| Browser interaction acceptance checks | **11 passed / 29**; 18 expected connections/persistence behaviors were missing | [Results](var/audit/browser-results.json) |
| Authentication contract checks | **4 passed / 9**; five frontend session propagation checks failed | [Results](var/audit/auth-results.json) |
| API inventory | 46 OpenAPI operations | [Contract snapshot](var/audit/openapi.json) |

These are selected acceptance checks, not a coverage percentage. A page returning HTTP 200 does not prove its buttons execute real tests. Missing implementations are included as failed acceptance checks. Some browser selectors needed correction; the counts above use the completed checks rather than treating harness errors as product defects.

Runtime testing used an isolated SQLite database, a deterministic planner with external AI keys disabled, the local planted-bug shop, and a separate small web application on port 3201. JWT checks used a local test signing secret, not a real Supabase account. The normal API database was kept separate. Audit scripts, logs, screenshots, caches and databases are in ignored `var/`.

## Page-by-page connection matrix

“Partial” means an actual API path exists; it does not mean all controls or all authentication modes work.

| Page | Connection | Actual behavior and limit | Main source |
|---|---|---|---|
| `/` Overview | Partial | KPIs, release gate, run-health and categories come from `/api/dashboard/overview`; lists can be API-seeded. Loop/pipeline visuals, runs-today, identities and release request still include demo behavior. | `app/(workspace)/page.tsx`, `components/dashboard/hero-readiness.tsx`, `lib/live.tsx` |
| `/runs` | Partial | Real run rows, filtering and navigation; KPI strip and timeline are fixtures. Duplicate friendly IDs produced React key errors and can select another project's run. | `components/runs/runs-view.tsx` |
| `/runs/new` | Partial, incorrect target selection | Creates a real plan, approves it automatically and starts a real run. The entered URL, repo, branch, account, secrets, selected suites, budget and worker count are not sent. Uses `items[0]` as the project. | `components/runs/new-run-view.tsx:60` |
| `/runs/live` | Partial | With `?run=...`, real events, approval and cancellation worked with auth off. Without a run parameter it shows the demo view. No authenticated stream ticket is attached. | `app/(workspace)/runs/live/page.tsx`, `components/runs/real-run-view.tsx` |
| `/plans` | Partial | Real list, details and approve/reject worked. API supports version editing and diff, but the screen has no edit/diff workflow. “New plan” leads to the simulated planner. | `components/plans/live-plans-view.tsx`, `services/api/trevyn_api/plans_ext.py` |
| `/regression` | Demo | Fixed suite/history and a timer claiming 209/212 passed; no execution request. Real regression is accessible through the finding repair panel instead. | `components/plans/regression-view.tsx` |
| `/findings` | Partial | API-seeded list and client filters worked. Owner/confidence values include backend-generated placeholders. Server-side loading loses authenticated sessions. | `components/findings/findings-view.tsx`, `lib/live-data.ts` |
| `/findings/[id]` | Partial | Real verdict, steps, evidence and repair panel. Browser-tested proposal, approval and before/after regression worked for the demo shop. Authenticated server loading and raw evidence URLs fail. | `components/findings/real-finding-view.tsx`, `components/findings/repair-panel.tsx` |
| `/board` | Partial | Dragging persisted through PATCH, including rollback code for errors. Verified enforcement can be bypassed; invalid columns are accepted. Development route check reported a DnD hydration mismatch. | `components/findings/board-view.tsx`, `services/api/trevyn_api/main.py:309` |
| `/approvals` | Partial | Real approve/reject requests and run resumption worked in the completed browser check. Friendly-ID collisions remain a risk. Real login/approver UI flow was not tested with Supabase. | `components/admin/approvals-view.tsx` |
| `/repair` | Demo | Fixed DEF-142 diff and root-cause graph. Approval starts an in-memory timer and reports 46/46 passed without a backend request. This differs from the real finding repair panel. | `components/repair/repair-view.tsx`, `lib/data.ts:44` |
| `/planner` | Demo | Request text is editable, but Generate waits 1.3 seconds and displays a constant list. No plan creation request is sent. | `components/plans/planner-view.tsx:25` |
| `/projects` | Demo | Cards come from `DEMO_PROJECTS`; New project only shows a success notification. | `components/admin/projects-view.tsx:17` |
| `/ui-testing` | Demo report | Browser scores, trace frames and LCP figures are fixtures. Run UI suite links to the partially connected wizard. The real Playwright runner exists elsewhere. | `components/quality/quality-views.tsx:29` |
| `/api-testing` | Demo | Endpoint graph, contract checks and latency figures are fixtures. Run API suite only shows a notification; no standalone API/unit adapter is connected. | `components/quality/quality-views.tsx:82` |
| `/perf` | Demo | Displays fixture load metrics; Rerun only shows a notification. API reports no performance engine results. | `components/quality/quality-views.tsx`, `services/api/trevyn_api/insights.py:188` |
| `/security` | Demo | Displays fixture scan statistics and findings; Scan only shows a notification. ZAP/Semgrep/OSV execution is absent. | `components/quality/quality-views.tsx` |
| `/compat` | Demo | Fixture OS/browser matrix; Run matrix makes no execution request. | `components/quality/quality-views.tsx` |
| `/network` | Demo | Fixture service map/HAR. Export produced no download. `/api/insights/network` exists but the screen does not call it. | `components/quality/network-view.tsx` |
| `/analytics` | Demo | Fixture trends, MTTR, heatmap and claim graph. `/api/insights/analytics` exists but is not used by this screen. | `components/quality/analytics-view.tsx` |
| `/integrations` | Demo | Switches only change React state. GitHub appeared connected while backend configuration reported false. No OAuth/repository installation is performed by this screen. | `components/admin/admin-views.tsx:23` |
| `/policies` | Demo editor | Allowlist edits disappear after reload; RBAC checkboxes, secrets and policy text do not update backend policy or membership. | `components/admin/admin-views.tsx:51` |
| `/settings` | Partial | Audit log is real and rendered backend rows. Appearance persists in localStorage. Model selection, budget and notification settings do not update the backend; budget reverted to 250 on reload. | `components/admin/admin-views.tsx:112`, `lib/prefs.ts` |
| `/login` (separate) | Conditional | Supabase magic link/GitHub sign-in and sign-out calls exist. Requires a real configured Supabase project. Account login does not implement repository onboarding. | `components/shell/login-form.tsx`, `components/shell/user-menu.tsx` |

Sources in this table are relative to `apps/web/` unless they start with `services/`.

## Confirmed problems to fix first

### 1. The wizard runs against a different target from the entered URL

Browser test entered `http://localhost:3201` and a repository URL. Requests instead generated a plan for the first stored project's `http://localhost:3100` environment. The request body contained the requirement and mode, then plan approval and run creation. No URL, repository, branch or account was transmitted.

Proof: `apps/web/components/runs/new-run-view.tsx:65`, [captured request bodies](var/audit/browser-results.json).

### 2. Friendly run IDs collide across projects

`next_display` counts runs within each project, so several projects get `RUN-2481`. `get_or_404` accepts a display ID without a project filter. Creating a run on the custom app and then fetching its returned friendly ID selected an older ShopFlow run with a different UUID. Loading the UUID selected the correct run and its browser assertions passed. The runs screen also logged duplicate React keys.

Proof: `services/api/trevyn_api/runs.py:82`, `services/api/trevyn_api/common.py:15`, [API results](var/audit/api-results.json). The same ID design is used for approvals and findings, so their addressing needs review too.

### 3. Login breaks server data, streams, evidence and copilot

- Actual browser `api()` wrapper with a test token: HTTP 200.
- The same wrapper in server context deliberately omits the token: HTTP 401; `tryApi()` converts this into `null`, enabling demo fallback.
- The frontend stream URL has neither bearer authentication nor a ticket: HTTP 401. The backend's supported ticket flow returned HTTP 200.
- Raw image/download URLs returned HTTP 401, while the same evidence request with a bearer token returned HTTP 200.
- Copilot's direct fetch omitted authorization and returned HTTP 401. Authenticated requests reached the expected AI-disabled HTTP 503 response.

Proof: `apps/web/lib/api.ts:21`, `apps/web/lib/live-data.ts:12`, `apps/web/components/runs/real-run-view.tsx:28`, `apps/web/components/findings/real-finding-view.tsx:53`, `apps/web/components/shell/copilot.tsx:31`, [auth checks](var/audit/auth-results.json).

### 4. Verified status does not require a completed successful regression

A direct move from Investigating to Verified returned HTTP 409. Moving to Regression first and then Verified returned HTTP 200 without creating or passing a regression run. The API and client check only the previous column. An arbitrary string such as `not-a-valid-column` was also accepted by the API; it can make a finding disappear from the board's fixed columns. Both test moves were restored afterward.

Proof: `services/api/trevyn_api/main.py:305`, `apps/web/lib/live.tsx:111`, [API results](var/audit/api-results.json).

### 5. Plan creation accepts another project's environment

Creating a plan under the custom project's ID with the ShopFlow environment ID returned HTTP 201. The lookup checks that the environment exists, but does not check its project ownership. This can select the wrong base URL even through direct API use.

Proof: `services/api/trevyn_api/main.py:138`, [API results](var/audit/api-results.json).

### 6. Custom reset/verification hooks are dropped during execution

The project API accepts and stores `hook_url`, but it creates the environment with `local_runner=False`. `_load` forwards hooks only for `local_runner=True`, and this flag is not exposed by project creation. For the custom local project, invoking the actual loader produced the correct base URL and `hook_url=None`. Therefore arbitrary projects cannot use their registered reset/count hooks through the current public flow.

Proof: `services/api/trevyn_api/main.py:115`, `services/api/trevyn_api/runs.py:205`, `services/api/trevyn_api/db.py:60`.

### 7. A global Live API data badge can accompany simulated results

The badge depends on successful workspace list reads. It does not describe the data source of each page. Security/performance/compatibility still showed sample results while their APIs returned `available:false`. Planner, integrations, standalone repair and regression controls also reported success without backend writes.

Proof: `apps/web/components/shell/copilot.tsx:65`, `apps/web/components/quality/quality-views.tsx:24`, [browser action results](var/audit/browser-results.json).

### 8. UI plan review is bypassed and execution settings are ignored

Launch generates a plan, posts `/approve`, then starts the run in the same handler. The user does not review the generated cases. Suite toggles, worker count, time budget, test account, secret reference and stop-on-critical setting are not part of the submitted run payload. White/gray-box selection does not supply source code or repository access.

Proof: `apps/web/components/runs/new-run-view.tsx:67`, `workers/orchestrator/trevyn_orch/planner.py:102`, `packages/contracts/trevyn_contracts/__init__.py:61`.

### 9. Build, hydration and stream cleanup need attention

- Both production builds finished with exit code 0 but logged “Unexpected cache miss after cache warming phase” at the workspace loader, particularly for finding routes.
- The board development route logged a server/client `DndDescribedBy` hydration mismatch. Drag persistence subsequently worked; this warning was not a crash.
- Closing the authenticated test stream logged `RuntimeError: aclose(): asynchronous generator is already running`. Its cleanup cancels a pending `anext` task and closes the generator without awaiting that cancellation.
- Several Watch live links omit the run parameter and therefore select the demo view even with API mode enabled.

Proof: `apps/web/app/(workspace)/layout.tsx:19`, `apps/web/lib/live-data.ts:10`, `apps/web/components/findings/board-view.tsx:133`, `services/api/trevyn_api/main.py:262`, `apps/web/components/dashboard/active-runs.tsx:29`.

### 10. Gemini is optional in code but its SDK is not declared

`GeminiAdapter` uses `google-genai`, but `pyproject.toml` does not include it and no Google namespace was installed after installing all declared dependencies. `available` checks only whether a key exists; it can therefore report AI available while the adapter cannot initialize. Planning has a template fallback; genuine AI behavior was not validated in this audit.

Proof: `workers/orchestrator/trevyn_orch/models.py:122`, `workers/orchestrator/trevyn_orch/models.py:130`, `pyproject.toml`.

## Application testing flows

### URL through the dashboard

Current flow:

```text
Entered URL / repository / branch
    -> local wizard state
    -> GET projects -> select first project
    -> generate plan from requirement -> automatically approve -> run stored environment
```

The wizard's URL/repository values do not reach the backend. This flow needs fixing before it can be described as testing an arbitrary entered URL.

### URL through the API

Implemented: register an authorized target and allowlist, generate a plan, edit cases as a new version, approve, run Playwright, collect evidence, classify findings and inspect run events. The custom application at port 3201 **passed real UI and network assertions** when addressed by UUID and given an explicit application-specific plan.

Incomplete: page exploration/DOM discovery before planning, application-specific test-account configuration, general reset hooks, reliable project/environment association, globally unambiguous IDs, and a frontend onboarding flow. Without a model, fallback plans use the ShopFlow routes, locators and hard-coded test account. A URL alone does not supply the information needed for reliable tests of an unknown application.

### Local application

Implemented at the backend: testing an already-running web app on the runner's computer. The isolated API used `ALLOW_PRIVATE_TARGETS=1`; the custom app was registered at `http://localhost:3201` and tested successfully.

The user must start that application. The existing system does not start arbitrary repositories or native desktop apps. A hosted runner cannot reach a user's laptop through that laptop's `localhost`; a remote agent/tunnel mechanism is not implemented here. Docker is optional for the basic SQLite/in-process setup and was not installed for this audit.

### GitHub repository

Implemented: `/api/webhooks/github` verifies HMAC and handles opened/synchronized PR events; it chooses the first project and its latest approved plan, deduplicating a trigger by PR number and commit SHA. Signature/trigger behavior is covered by the passing unit suite.

Missing: repository installation/credentials and mapping, clone/checkout, isolated dependency installation/build/start, preview-environment selection, source-driven white-box tests, and pushing real code repairs. The integration switch does not configure the webhook. A PR event currently reruns an existing configured target; it does not test the submitted repository or its PR build.

Proof: `services/api/trevyn_api/integrations.py:32`, `apps/web/components/admin/admin-views.tsx:37`, `apps/web/components/runs/new-run-view.tsx:91`.

### Repair and regression

The real finding panel successfully proposed a demo fix, approved it, ran a browser regression and displayed before/after data. The standalone Repair and Regression pages remained simulated. The backend's demo repair changes a planted-bug flag through the shop's hook; the displayed diff represents an equivalent change and is not applied to a connected repository.

Proof: `services/api/trevyn_api/repairs.py:96`, `services/api/trevyn_api/repairs.py:189`, [repair loop](var/audit/repair-loop.log), [browser results](var/audit/browser-results.json).

## Suggested repair order

1. Wire project creation and selection; transmit and persist URL/environment/account configuration. Use UUIDs in URLs, client keys and mutations, or introduce project-scoped addressing.
2. Enforce environment ownership and validate board columns. Require a real verified regression result before marking a finding Verified.
3. Carry sessions through server reads; use the stream-ticket endpoint; authenticate evidence access and copilot requests. Avoid silently replacing authorization failures with demo data.
4. Add real plan review to launch. Connect Planner, standalone Repair/Regression, Analytics and Network to existing APIs. Disable or label execution buttons for missing engines.
5. Persist policy/settings changes through real endpoints; replace fixture integration indicators with backend status. Repair cache/hydration/stream cleanup errors.
6. Add discovery, credentials/reset hooks and then a repository build/runner lifecycle before claiming arbitrary URL or GitHub testing.

## Limits

Real Supabase OAuth/JWKS, external AI replies, real GitHub delivery, Slack, Jira, S3/MinIO, Redis/Celery deployment, OPA server execution and production hosting were not validated. The audit used SQLite and in-process orchestration. Browser console results came from a development server; the production build was checked separately. Global store refresh passed the tested client-navigation case, so lack of an explicit shared SSE update was not counted as a reproduced refresh failure.

The audit added reports and repaired dependency lockfiles. It did not implement the missing product features or change their behavior.
