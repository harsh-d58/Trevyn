# ANALYTICS.md: live data on every page

> **Written:** 24 Oct 2026. **Goal:** with the API on, no page shows mock data. Every number comes from the database,
> updates live through the workspace event stream, and shows an honest empty state when nothing has run yet.
> **Read with:** [PROGRESS1.md](PROGRESS1.md) (current state) · [PLAN_MODES.md](PLAN_MODES.md) (pipeline, lanes, events).

---

## 0. Rules

1. **Demo data only in demo mode.** `lib/demo/*` and `lib/data.ts` fixtures load only when the API is off or
   `NEXT_PUBLIC_DEMO_MODE=1`. Constants (column names, labels, colours) are fine; numbers, names and rows are not.
2. **No fake fallback.** A live page with no data shows an empty state that says what produces the data
   ("No performance runs yet — the k6 lane is planned for Phase 4"), never demo rows.
3. **One source per number.** Totals are computed once in the API (`stats.py`), not re-derived in components.
4. **Every page is live.** A change that affects a page publishes a workspace event; the page refetches on it.
5. **Project scope.** Every endpoint accepts `?project=`; the shell's project switcher sets it for the tab.
6. **Measured, not invented.** Cards whose engine does not exist yet (performance, API, compatibility) say so;
   they never show sample charts.

---

## 1. Where each page stands (audit, 24 Oct)

| Page / area | Today | Data it needs | Exists in API? |
|---|---|---|---|
| Live run, Runs ledger | ✅ live | runs, run events, graph | yes |
| Plans, Findings, Finding detail, Board, Approvals | ✅ live | findings, approvals, plans | yes |
| Copilot | ✅ live | `/api/assistant/chat` | yes |
| **Island** | ❌ demo script | active runs, latest flash | runs yes; store not wired |
| **Top bar**: project switcher, notifications | ❌ `DEMO_PROJECTS`, `NOTIFICATIONS` | projects, workspace events | yes |
| **Overview**: KPIs, gate, run health, categories | ✅ live | `/api/dashboard/overview` | yes |
| **Overview**: stat pills, loop rings, pipeline strip, loop strip | ❌ store fields `run`, `loop`, `runsToday`, `repair` are demo | active runs, today's plan/prove/decide counts, repair state | partial |
| **Overview**: failing suites, throughput, week slots | hidden in live mode | per-suite failures, runs/day, schedule | no |
| **Analytics** | ❌ `lib/demo/insights` | finding flow, MTTR, heatmap, model cost, flaky tests, pass rate 30 d | mostly (`/api/insights/analytics`) |
| **Network** | ❌ demo | endpoints, status codes, latency, waterfall | partial (`/api/insights/network`, no latency) |
| **UI testing** | ❌ demo | UI runs, traces, screenshots, page weight, LCP | partial (evidence yes, timings no) |
| **Security** | ❌ demo | passive rules P1–P9 by severity, entry points | data yes (findings `passive:*`), endpoint no |
| **API testing, Performance, Compatibility** | ❌ demo | engine results | **no engine** |
| **Planner** | ❌ demo | plan, risk per case, site/repo map, model confidence | partial (`/api/plans/{id}`) |
| **Repair** | ❌ `getRepair()` + `rcGraph` | repair proposals, diagnosis, diff, approval | yes (`/api/repairs`) |
| **Regression** | ❌ `getRegression()` | case × run history | yes (`/api/projects/{id}/history`) |
| **Projects** | ⚠️ falls back to `DEMO_PROJECTS` | projects, envs, repo | yes |
| **Policies** | ❌ demo (allowlist, secrets, RBAC) | rego, allowlist, roles, secret refs | partial (members, policy decisions) |
| **Settings** | ⚠️ audit live, rest demo | models, budgets, notifications | partial (`/readyz`) |
| **Integrations** | ❌ `INTEGRATIONS` | Slack/Jira/GitHub/S3 status | partial (`/api/integrations`) |
| **New run wizard** settings | ⚠️ shown, not sent | suites, budget, workers, safety switches | no |

---

## 2. Architecture

```
Postgres ──► stats.py (pure aggregation, one function per card)
               │
               ├─► GET endpoints (?project=, ?days=)  ──► lib/live-data.ts (server, cacheLife "seconds")
               │                                         └─► lib/live.tsx store (client, lists + shell state)
               │
pipeline / API actions ──► events.publish(type, payload) ──► /api/events/stream ──► useWorkspaceEvents
                                                                                       │ debounce 700 ms
                                                                                       ├─ store.sync(...)
                                                                                       └─ router.refresh()
```

- **`services/api/trevyn_api/stats.py`** (new): aggregation helpers shared by overview, analytics, security,
  regression. Moves the logic now inside `insights.py` so it can be unit-tested without HTTP.
- **Project scope:** `scope(q, model, project)` helper; every list/insight endpoint takes `project`.
  The switcher stores the choice in a cookie (`trevyn_project`) so server components read it too.
- **Event → refetch map** (frontend, one table):

| Event | Refetches |
|---|---|
| `run_created`, `run_state` | runs, overview, island, live run list |
| `finding_created`, `finding_updated` | findings, board, overview, analytics, security |
| `approval_created`, `approval_decided` | approvals, review queue, island flash |
| `plan_ready`, `plan_updated` | plans, planner |
| `repair_*` (new) | repair, regression, overview loop |

- **Empty states:** one `<Empty what="…" why="…" action={…}/>` kit component, used on every live card.

---

## 3. Modules

Each module lists: **shows** · **source** · **API** · **frontend** · **live** · **empty state** · **tests** · **size** (S < ½ day, M ≈ 1 day, L > 1 day).

### M1. Shell: island, project switcher, notifications, stat pills
- **Shows:** active run(s) with progress; flashes for new confirmed findings, approvals, finished runs;
  current project; unread notifications.
- **Source:** runs not in a terminal state; workspace events.
- **API:** existing `/api/runs`, `/api/projects`, `/api/events`. Add `?active=1` to `/api/runs`.
- **Frontend:** in live mode the store's `run` comes from the newest active run (`total`, `done` from counts,
  state from `run_state`); `runsToday` from runs started today; the demo script never runs.
  Switcher lists `/api/projects` with environment badge; notifications list the last 20 workspace events
  (read/unread kept in `localStorage`).
- **Live:** `run_created`, `run_state`, `finding_created`, `approval_created`.
- **Empty:** island "All quiet · no live runs" (now true); switcher "No projects — create a run".
- **Tests:** store unit test (active run derivation); browser check: start a run, island shows it within 2 s.
- **Size:** M.

### M2. Overview
- **Shows:** KPIs, release gate, run health, categories (live already); loop rings (today's plan → prove → decide);
  review queue; pipeline strip (the latest run's graph); failing suites; throughput (runs/day, cases/day);
  week slots (scheduled runs — none yet).
- **Source:** runs, findings, approvals, repairs; run graph.
- **API:** extend `/api/dashboard/overview` with `loop` (`plan`: plans created/approved today, `prove`: cases
  verified/total today, `decide`: approvals decided/created today), `throughput` (14 days), `topSuites`
  (failures grouped by plan requirement / test-case prefix). Pipeline strip uses `/api/runs/{id}/graph`.
- **Frontend:** remove the `!live` hide; week slots show "No schedules yet" until schedules exist (Phase 5).
- **Live:** all event types (debounced).
- **Tests:** `stats` unit tests for loop and throughput windows.
- **Size:** M.

### M3. Runs
- Already live. Add: filters by project/state/trigger in the API (now client-side), run comparison view
  (`/api/runs/{id}/comparison` exists) linked from regression runs, and the manifest download.
- **Size:** S.

### M4. Findings, Board, Finding detail
- Already live. Add: category and severity filters including `security`/`network` from passive checks; the
  passive rule (`verdict.rule = passive:P1`) and its JSON evidence shown on the detail page; bulk move on Board.
- **Size:** S.

### M5. Quality engines

| Page | Phase 2 (data we already capture) | Later (new engine) |
|---|---|---|
| **UI testing** | UI runs per day, pass rate, slowest steps (`step.t_ms`), latest screenshots and traces per case, console errors per page | cross-browser matrix (M5-compat) |
| **Security** | passive rules P1–P9: severity donut, rule table with first-seen/last-seen, pages affected, evidence links; trend per run | ZAP passive proxy lane, Semgrep on connected repo (gray box) |
| **Network** | endpoints, status codes, duplicate POSTs (exists); add per-request duration (runner records `t` at request and response) → latency p50/p95, waterfall for one case | HAR export |
| **API testing** | "Not run yet": explains the planned lane | OpenAPI discovery + contract lane (schemathesis-style), gray box |
| **Performance** | "Not run yet" | k6 lane with thresholds, read-only endpoints only, approval-gated |
| **Compatibility** | "Not run yet" | Playwright projects chromium/firefox/webkit as a lane fan-out |

- **API:** `/api/insights/security`, `/api/insights/ui`, extended `/api/insights/network`; `/api/insights/{engine}`
  keeps returning `available: false` for engines not built.
- **Runner change (network latency):** record response time and size per request in `network.json`.
- **Size:** UI M, Security M, Network M; each new engine L (Phase 4).

### M6. Analytics
- **Shows:** finding flow, findings by type, pass rate 30 days, MTTR weekly, failure heatmap, most flaky tests,
  model cost by node, policy denials.
- **Source/API:** `/api/insights/analytics` already returns flow, heatmap, MTTR, model cost, denials. Add
  `passRate30` (daily) and `flaky` (cases with both outcomes in the last N runs, from project history).
- **Frontend:** replace `lib/demo/insights` reads with the endpoint; titles computed ("Finding flow · N findings").
- **Size:** M.

### M7. Planner and Plans
- **Shows:** the selected plan's cases with risk, side effects and gate status; risk vs confidence chart
  (confidence = model self-report when AI planned, rule score otherwise); what Trevyn saw (site map, repo map);
  plan versions and diff.
- **API:** `/api/plans/{id}` (+ `site_map`), `/api/plans/{id}/diff` exist. Add `risk_score` per case at plan
  time (deterministic: side effects, write-like controls, auth pages).
- **Frontend:** Planner picks the latest plan of the current project; autonomy threshold reads the policy value.
- **Size:** M.

### M8. Repair and Regression
- **Shows:** repair proposals with diagnosis, prompt, diff guard result, approval and regression proof;
  regression grid (cases × last 20 runs).
- **API:** `/api/repairs`, `/api/repairs/{id}`, `/api/runs/{id}/comparison`, `/api/projects/{id}/history` exist.
  Publish `repair_proposed`, `repair_decided`, `repair_verified` events.
- **Frontend:** RepairView and RegressionView take API data; `rcGraph` (root-cause graph) is built from the
  diagnosis hypotheses and their evidence links instead of the demo graph.
- **Note:** real code repair (patching a repository) is a separate track; until then the page states that
  repairs apply to the demo shop only.
- **Size:** M.

### M9. Approvals, Policies, Settings, Integrations, Projects
- **Policies:** show the real `trevyn/gate.rego` (read-only file), the project allowlist (`allowed_domains`,
  editable by owners), roles from `/api/members`, recent policy decisions. **Secrets:** a `secret_refs` table
  (name, reference URI, project, created by) — references only, never values.
- **Settings:** AI provider and model per node from `/readyz` + env (read-only), budgets
  (`RELEASE_GATE`, run time budget defaults) in a `workspace_settings` table, notification targets.
- **Integrations:** `/api/integrations` returns configured/not configured per integration with last use time.
- **Projects:** remove `DEMO_PROJECTS` fallback; add history sparkline from `/api/projects/{id}/history`.
- **Migrations:** `0007_settings` (`workspace_settings`, `secret_refs`).
- **Size:** L.

### M10. Wizard settings enforcement
- Send `suites`, `budget_min`, `workers`, `synthetic_only`, `stop_on_critical` with `POST /api/runs`; store in
  `runs.config` (JSON, migration `0008_run_config`).
- Graph: lanes run only when their suite is on; a budget deadline cancels remaining cases with
  `stopped: budget`; `stop_on_critical` cancels after the first confirmed high finding; `workers` limits
  parallel cases (UI lane runs N browsers).
- **Size:** M.

### M11. Cross-cutting
- `stats.py` + tests; `scope()` helper; `<Empty>` component; event → refetch map in one file.
- **Guard:** `scripts/check_no_demo.mjs` fails the web build if a live code path imports `lib/demo` data
  (allowlist for constants). Run in CI.
- **Performance budget:** each insight endpoint < 300 ms on 10k findings; add indexes
  (`findings(project_id, created_at)`, `runs(project_id, started_at)`) in `0007`.
- **Size:** M.

---

## 4. Phases

| Phase | Modules | Exit criteria |
|---|---|---|
| **P1 Wire what exists** | M1, M3, M4, M8 (frontend), M9-Projects, M6 (existing fields) | island, switcher, notifications, analytics, network, repair, regression, projects show API data; 0 demo imports on those pages |
| **P2 New aggregates** | M2, M5 UI/Security/Network, M6 additions, M7, `stats.py` | overview fully live incl. loop/throughput; Security page built from passive checks; latency in network |
| **P3 Settings & enforcement** | M9 rest, M10, migrations 0007/0008 | policies/settings/integrations live; wizard settings change what the run does |
| **P4 New engines** | API contract, k6, browser matrix lanes | each engine page shows its own runs; "not run yet" only before the first run |
| **P5 Cleanup** | M11 guard, schedules (week slots), empty states everywhere | `check_no_demo` passes in CI; demo mode still works with fixtures |

Order inside P1 (start here): **M1 store live fields → top bar → analytics → network → regression → repair → projects.**

### Progress (24 Oct)

| Item | Status |
|---|---|
| M1 store live fields | ✅ |
| M1 top bar | ✅ |
| M6 Analytics | ✅ |
| M5 Network | ✅ (pulled forward from P2) |
| Regression, Repair, Projects | ⏳ next |

- **M1 store live fields:** in live mode the island, stat pills, pipeline map and loop strip come from real runs.
  - New `run_progress` workspace event, published from the UI lane.
  - `/api/dashboard/overview` now returns `loop` and `runsToday`.
  - Verified in a browser: the island goes 0/2 → 1/2 → 2/2 → completed, with no DEMO badge.
- **M1 top bar:**
  - The switcher lists real projects. It says "All projects" because `?project=` filtering comes in P2.
  - Notifications come from `/api/events?latest=20`.
- **M6 Analytics:** live page built on `/api/insights/analytics`, which gained `byType`, `passRate30`, `flaky`, `evidence` and `diagnoses`.
- **M5 Network:**
  - The runner records `ms` per request.
  - `/api/insights/network` gained p50/p95, `statusCodes` and a `waterfall`.
- **Shared kit:** `components/kit/page-loading.tsx` (`PageLoading`, `Empty`). With the API on, pages show a loading or error state, never demo numbers.
- **Run scope (every page follows one run):**
  - The top-bar run picker writes the `trevyn_run` cookie and calls `store.setScope`.
  - Overview, analytics, network, findings and approvals take `?run=` (uuid or display id).
  - The store reloads its findings, approvals and loop for that run, so Board, Findings, Approvals, the review queue and the overview follow it.
  - Server pages read the cookie (`lib/scope-server.ts`). The live run page and the pipeline map default to the picked run.
  - Verified in a browser: All runs shows 10 findings; RUN-2482 shows its own 5 on Analytics and Board; switching back to All runs shows 10 again.
- **Human-in-the-loop fix:**
  - The cause was the demo script running against a real run: a refresh that fell back to demo data switched it on.
  - The store mode is now fixed when the store is created. Demo actions refuse to run in live mode. With the API on there is no demo fallback; reads that fail show empty.
  - Approvals carry `run` and `runUuid`. `store.decideGate` approves the real gate.
  - Verified: a high-risk gate was approved by clicking Approve on /approvals (POST to AP-1, 200), and the run resumed and completed.
- **AI on (FastRouter):**
  - `MODEL_PROVIDER=fastrouter`, `LLM_BASE_URL=https://go.fastrouter.ai/api/v1`.
  - Planner, diagnostician and fix use `anthropic/claude-haiku-5.5`; the assistant uses `google/gemini-2.5-flash`. Sonnet returned 402 on the current balance.
  - Output is capped per node (`LLM_MAX_TOKENS_*`).
  - A plan costs about $0.005. Both e2e scripts pass with AI planning.
- **Planner reliability:**
  - `sitemap_plan`: the no-AI fallback builds page, link and form cases from the scan, never fewer than the 2 smoke cases.
  - Invalid AI cases are dropped instead of discarding the plan, and assertions whose subject isn't a locator are rejected.
  - Demo-shop prompts include its known working journeys.
- **Runner:**
  - `label=` also matches a field's placeholder.
  - Quoted names (`name='Active'`) are unquoted.
  - Clicking a disabled control counts as an ignored click.
- **Scan:** records hidden buttons separately and marks each field visible or not.
- **Merge note:** the incoming dashboard redesign shows `LoopRings`, `PlatformPipeline` and `LoopStrip` only in its demo-mode "Demo tools" panel. Their live versions exist now; whether they return to the live overview is a design call.

---

## 5. Testing

- **API:** `tests/test_stats.py` (aggregation windows, project scope, empty DB returns zeros not errors);
  one test per new endpoint with seeded data.
- **Web:** typecheck, lint, `next build`; `check_no_demo`.
- **Browser:** `tests/manual_live_pages.py` visits every page with the API on and an empty DB (empty states,
  no console errors), then after the golden-path e2e (numbers present, no demo names like "ShopFlow" unless the
  seeded project is used).
- **Live:** second-tab check: a finding created in one tab appears on Board/Findings/Overview in the other.

## 6. Risks

- **Aggregation cost:** current insight endpoints load whole tables; move to SQL aggregates in `stats.py` (P2).
- **Seeded demo project:** the API seeds "ShopFlow Commerce" for the demo shop; it is real data for the local
  shop, not mock — label it "Demo shop" in the switcher.
- **Engines not built:** performance/API/compat pages stay mostly empty until P4; that is intended.

## 7. Quality-lane update (24 Oct 2026)

The run-scoped quality build has five new rule-based lanes. ZAP baseline has a parser and LangGraph lane with a warning path when Docker is unavailable; P1-P9 remain independent. The UI runner captures sanitized HAR files alongside Playwright traces. `/api/insights/network` reads HAR timings where present and falls back to the existing network log; Network & traces exposes per-case HAR and trace links. The security projection exposes passive rule outcomes and parsed ZAP alerts with CWE IDs. A compatibility lane records safe-case outcomes for Firefox, WebKit, and an iPhone 13 preset. Chromium injects vendored axe-core and web-vitals after/before navigation respectively, storing WCAG 2.1 A/AA violations and real browser metrics as evidence. A Lighthouse lane measures up to four pages and stores its JSON report and parsed score/metric/opportunity evidence. A gray-box repository lane verifies a pinned checkout and runs installed OSV-Scanner/Gitleaks CLIs, persisting only redacted Gitleaks fields. Security, Performance, Compatibility, UI, Planner, and Network read their selected run's stored results. Missing tools or measurements remain “not run” or lane warnings; a new run with the tools installed is needed to populate the pages.
