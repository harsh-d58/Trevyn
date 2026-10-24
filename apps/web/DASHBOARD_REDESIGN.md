# Dashboard redesign: scope and integration map

## Before implementation

The redesign changes the Overview page and its presentation components only. API helpers, authentication, the workspace provider/store, execution, approvals and repair handlers remain unchanged. No dependencies are needed.

### Existing dashboard connections

| Source / component | Existing connection | Safe presentation work |
| --- | --- | --- |
| `app/(workspace)/page.tsx`, `lib/live-data.ts` | `GET /api/dashboard/overview`; demo summary fallback in Suspense | Page composition, sections, clear source labels, loading presentation |
| Workspace layout / `LiveProvider` | `GET /api/findings`, `/api/runs`, `/api/approvals?status=pending` through existing server getters | Read the existing store; do not change subscriptions or seeding |
| `KpiRow` | Overview KPIs; pending count from store | Typography, cards, correct comparison period |
| `ReviewQueue` | Existing `POST /api/approvals/{id}/decision` with `{approve:true, reason:""}`; demo store actions | Retain component and all handlers / high-risk confirmation; change surrounding layout/styles only |
| `ActiveRuns` | Store run summaries; existing navigation | Table/card presentation and empty states |
| `RunHealth`, `CategoryPolar` | Overview chart arrays; links to runs/findings | Chart styling, zero-data handling, accurate date captions |
| `HeroReadiness` | Overview gate; release CTA mutates demo store only | Keep existing demo control in a clearly labelled demo disclosure; live summary is read-only |
| `PlatformPipeline`, `LoopStrip`, `LoopRings` | Scripted demo store, fixture counts/evidence | Keep available in labelled demo disclosure; do not represent as backend telemetry |
| `FailingSuites`, `Throughput`, `WeekSlots`, `StatPills` | Fixtures / demo counters | Keep demo-only content explicitly labelled |
| Shell, rail, command menu, user menu, copilot | Existing navigation, appearance and auth controls | Leave behavior and permissions unchanged |
| Header wordmark | Requested a nonexistent `/trevyn-logo.png`, then fell back to text | Render the existing text wordmark directly; remove the 404 without changing navigation |

The redesigned Overview adds one read using the existing authenticated `api()` helper: `GET /api/projects`, already used by the run wizard. This enables an accurate empty-project state. It makes no writes and uses the endpoint's existing `{items:[{id,name,environments}]}` response. An unavailable request is displayed as unknown, never as zero projects.

## State mapping

These are display conditions, not new backend statuses or transitions:

| Display | Existing data |
| --- | --- |
| No project connected | Successful projects response with `items.length === 0` |
| Connected, no runs | Nonempty projects response and empty live run list |
| Running | Run summary `status === "running"`; raw `AWAITING_APPROVAL` is labelled waiting for approval |
| Completed successfully | Run summary `status === "passed"` |
| Completed with failures | Run summary `status === "failed"` |
| Needs review | Pending approval list and/or findings with `column === "approval"`; show each count separately |
| Inconclusive / stopped | Preserve `warn` / `stopped`; raw `FAILED`, `BLOCKED`, `CANCELLED` remain distinct labels |
| API unavailable / auth fallback | Explicit sample-data label and connection-unavailable message; never claim a live connection |

All metrics cover the entire workspace. Reading project names does not introduce project filtering. The backend overview uses a 7-day KPI comparison and 14 daily chart buckets. Demo comparisons remain 30 days.

## Frontend-compatible limits

- Project registration stays in the existing New test run wizard. The Projects page's existing add control is not replaced or rewired.
- GitHub cloning/building and generic report exports are not added. Navigation uses existing Runs, Findings, Analytics and evidence views.
- Home displays the existing store/overview snapshot. Live progress and human gate decisions continue in the existing per-run SSE view. No new execution, polling or approval logic is introduced.
- Existing authenticated server-loader and EventSource limitations are documented separately in the earlier integration audit; they are outside this presentation task.

## Validation

Validated on 24 October 2026:

- **39/39 browser/integration checks passed** against an isolated local API database and a copied frontend preview. Evidence: [`../../var/ui-redesign/results.json`](../../var/ui-redesign/results.json).
- **29/29 existing core tests passed**, including existing auth role rules, verifier, manifest and guard tests. One existing Pydantic test-class collection warning.
- `npm run build` passed, including TypeScript and all 38 prerendered pages. Build log: [`../../var/ui-redesign/production-build.log`](../../var/ui-redesign/production-build.log).
- `tsc --noEmit`, ESLint and `check:legacy` passed; `git diff --check` passed.
- Confirmed the no-project state with an intercepted, empty response matching the existing projects API contract; confirmed no-runs using the fresh database. Real runs exercised passed, failed, active execution, awaiting approval and findings-in-approval displays.
- The existing wizard registered the local target, generated/approved its plan, and executed two browser tests successfully. The existing run view received terminal status via SSE.
- High-risk approval still required explicit confirmation. Captured request remained `POST /api/approvals/AP-1/decision` with exactly `{ "approve": true, "reason": "" }`; backend records confirmed approval and a successful resumed run. The harness initially sampled request callbacks before Playwright delivered them after synchronous API polling; the final check reconciles the saved network capture with persisted results.
- Findings, screenshot evidence, the run manifest and eight existing destinations responded successfully. Chart range/series controls and category filter links remain functional.
- Checked widths **390, 768, 1440 and 1920px**. Final mobile document had no horizontal overflow. Final dashboard checks recorded **zero browser console errors, exceptions or HTTP errors**. The deliberate project-permission denial was checked separately and displayed gracefully.
- Screenshots: [`../../var/ui-redesign/final-desktop.png`](../../var/ui-redesign/final-desktop.png), [`../../var/ui-redesign/final-mobile.png`](../../var/ui-redesign/final-mobile.png), and each tested state under `var/ui-redesign/`.
- Verified no diff in backend/services/workers/contracts/scenarios, API helpers, authentication, shared state, execution components, approval handlers or dependency manifests/lockfiles. No schema or migration files changed. Validation wrote disposable test records only to its own database.

### Existing behavior retained

The workspace's cached server getters can initially show an older run snapshot after navigation. Full reloads after cache revalidation were used to verify completed states; the redesigned page explicitly says **API-backed snapshot** and links to the existing per-run live view. The shared store/cache/SSE implementation was not changed.

External Supabase sign-in/JWKS, hosted GitHub integrations and production permissions were not exercised against external accounts. Existing role-rule tests passed, a denied project read was tested in the browser, and all auth/session code is unchanged.

The preview required a temporary copy because a development server was already running. Preview-only configuration and test helpers are ignored under `var/ui-redesign/`; the repository's Next configuration is unchanged. Only validation services on ports 3210, 18020 and 3201 were started for this task; existing user services are left running.

## Copy and layout refinement

Removed slogans, repeated captions, explanatory paragraphs, the decorative footer and the empty snapshot illustration. Kept concise status details, metrics, data-source labels, charts and actions. The status/approvals row now appears above Metrics. `ReviewQueue` changes are limited to its title and empty-state text; all handlers remain unchanged. Desktop/mobile browser checks verify the shorter copy, important sections, status-card order and no horizontal overflow.
