# RUN_SCOPE_PLAN.md: every page shows the selected run

> **Written:** 24 Oct 2026. **Goal:** pick a project and one of its runs in the top bar, and **every** page shows that
> run's results: all charts, tables and diagrams, including the Quality Engineering pages. Nothing on a page comes
> from demo data when the API is on.
> **Builds on:** [ANALYTICS.md](ANALYTICS.md) (live data P1) · [PROGRESS1.md](PROGRESS1.md) (pipeline).

---

## 1. Why it doesn't show up today

The run picker exists, but only some pages listen to it. The rest still render the original demo data from `lib/demo/*`.

| Page | Follows the picker today? | What it shows now |
|---|---|---|
| Overview, Analytics, Network | ✅ yes | that run's numbers |
| Board, Findings, Approvals, review queue | ✅ yes | that run's findings and gates |
| Live run | ✅ opens the picked run | real |
| Runs ledger | ❌ | all runs, picked run not highlighted |
| Plans | ❌ | all plans, not the run's plan |
| **Planner** | ❌ demo | `lib/demo/insights` |
| **UI testing** | ❌ demo | `lib/demo/quality` |
| **API testing** | ❌ demo | `lib/demo/quality` |
| **Performance** | ❌ demo | `lib/demo/quality` |
| **Security** | ❌ demo | `lib/demo/quality` |
| **Compatibility** | ❌ demo | `lib/demo/quality` |
| **Repair** | ❌ demo | `getRepair()` + `rcGraph` |
| **Regression** | ❌ demo | `getRegression()` |
| Projects | ⚠️ falls back to `DEMO_PROJECTS` | |
| Policies, Settings, Integrations | ⚠️ workspace-wide (correct), but partly demo | |
| Finding detail | ✅ real (by finding id) | |
| **Diagrams** (FlowMap and graphs) | ❌ mostly hand-drawn demo nodes | `lib/demo/findings`, `lib/demo/insights`, `lib/demo/repair` |

So the fix is mainly **frontend wiring plus a few run-level API endpoints**. Each run already stores enough data for every page.

## 2. What each run already stores (no new data collection needed, except §6)

| Data | Where | Feeds |
|---|---|---|
| Run state, counts, trigger, timing | `runs` | headers, KPIs, ledger |
| Plan: every case, steps, assertions, risk, side effects | `plans.test_cases` (`runs.plan_id`) | Planner, Plans, UI and API testing |
| Site scan: pages, links, buttons, fields | `site_maps` (`plans.site_map_id`) | Planner, Security entry points, diagrams |
| GitHub file map, commit | `plans.repository_map` | Planner (grey box), Repair |
| Every step, assertion, verdict, gate, lane, node event | `run_events` | UI testing, pipeline diagram, timeline |
| Screenshots, traces, `network.json` (with ms), `console.json`, passive JSON | `evidence` (+ files) | UI testing, Network, API testing, Performance |
| Findings (category ui/security/network, rule, severity, evidence) | `findings` | Security, Board, Repair |
| Gates and decisions | `approvals` | Approvals, pipeline gate node |
| AI calls (model, tokens, cost) | `model_calls.run_id` | Planner, Analytics, Settings |
| Policy decisions | `policy_decisions` | Policies |
| Repairs and regression comparison | `repairs`, `regression_results` | Repair, Regression |

## 3. Architecture

```
Top bar:  [ Project ▾ ] [ Run ▾ ]          ← one scope = { project, run }; run defaults to the project's latest
              │ cookie trevyn_scope + store.setScope()
              ▼
Server pages ── scopedRun() ──► GET /api/runs/{run}/<view>     (one endpoint per page, all keyed by run)
Client parts ── useScope()  ──► same endpoints / store lists scoped by run
Live updates ── workspace events (run_state, finding_created, …) ──► refetch the current page's view
Diagrams ───── built from the same run data by one module: diagrams.py → {nodes, edges} → <FlowMap/>
```

- **One rule:** every view endpoint lives under `/api/runs/{run}/…` (uuid or RUN-id), or takes `?run=`. No page computes
  run data on its own.
- **`services/api/trevyn_api/run_views.py`** (new): the run-scoped view endpoints in §5, built on shared helpers
  (`load_run_bundle(run)` returns run, plan, site map, events, evidence, findings, approvals, repairs and model calls).
- **`services/api/trevyn_api/diagrams.py`** (new): turns run data into `{nodes, edges}` for every diagram in §4, so the
  frontend only draws them.
- **Frontend:**
  - `lib/scope.ts` grows `useScope()`, which returns the project, the run and a `withRun(path)` helper.
  - Every page under `app/(workspace)` gets the same shape: `apiEnabled ? <Suspense><Live run={await scopedRun()}/></Suspense> : <DemoView/>`.
  - Each `components/quality/*` view gets a `live-*.tsx` twin that takes API data (as Analytics and Network did).
- **No run picked:** the page shows the **latest run** of the selected project (never demo data); "All runs" stays
  available where it makes sense (Overview, Analytics, Board).
- **Empty states:** a run without data for a page says why, for example "This run had no API calls" or "Performance engine not
  run on this run".

## 4. Diagrams generated from the run (no hand-drawn nodes)

| Diagram | Page | Built from |
|---|---|---|
| Pipeline map (intake → recon → gate → lanes → verify → report) | Overview, Live run | `run_events` node/lane events (exists: `/runs/{id}/graph`) |
| **Site map graph** (pages as nodes, links as edges, forms marked) | Planner, Security, UI testing | `site_maps.content` |
| **Test coverage map** (pages, then the cases that visit them, coloured by verdict) | UI testing, Planner | plan cases' `goto` targets + verdicts |
| **User journey flow** per case (step → step, failed step red, screenshot per node) | UI testing, Finding detail | `run_events` steps + screenshots |
| **API call graph** (page, then endpoints it called, coloured by status/latency) | API testing, Network | `network.json` per case |
| **Service map** (browser → hosts it called: app, CDN, third-party) | Network | `network.json` hosts |
| **Security attack-surface graph** (entry points = pages/forms/cookies, then the failing rules P1–P9) | Security | site map + passive findings |
| **Finding → evidence network** | Analytics | findings + evidence (exists) |
| **Root-cause graph** (finding → hypotheses → supporting evidence) | Repair | `findings.diagnosis` + evidence ids |
| **Regression diff graph** (case: baseline outcome → rerun outcome) | Regression | `regression_results` |
| **Repository map tree** (top folders/files the plan used) | Planner (grey box) | `plans.repository_map` |

Endpoint: `GET /api/runs/{run}/diagrams/{name}`, which returns `{nodes:[{id,label,sub,k,x,y}], edges:[{from,to,k,l}]}` with
layout done server-side (columns by type), so `FlowMap` renders it unchanged.

## 5. Page-by-page plan (all pages)

| # | Page | Shows for the selected run | Endpoint (new unless noted) | Diagram | Size |
|---|---|---|---|---|---|
| 1 | **Top bar** | Project ▾ then Run ▾ (runs grouped by project, latest first, state + pass count); island stays global | `/api/projects` + `/api/runs?project=` | — | S |
| 2 | Overview | ✅ done; add the "Run" header card and use the run's own pipeline map instead of the demo panel | exists | Pipeline | S |
| 3 | Runs ledger | the run pinned and highlighted, the rest of the project's runs below, compare with previous run | `/api/runs?project=` | — | S |
| 4 | Live run | ✅ done (opens the picked run) | exists | Pipeline, lanes | — |
| 5 | Plans | the run's plan version, its cases, diff vs previous version | `/api/runs/{run}/plan` | — | S |
| 6 | **Planner** | requirement, AI/site-map source, cases with risk/side effects/gate, what the scan saw, repo map, AI cost | `/api/runs/{run}/planner` | Site map, Coverage, Repo tree | M |
| 7 | **UI testing** | cases × steps table, pass/fail per step, slowest steps, screenshot gallery, trace links, console errors | `/api/runs/{run}/ui` | Journey per case, Coverage | M |
| 8 | **API testing** | every `/api/*` (same-host XHR/fetch) call made during the run: method, path, status, p50/p95, duplicates; contract tests marked "not run" | `/api/runs/{run}/api-calls` | API call graph | M |
| 9 | **Performance** | measured from this run: page load per goto, time to first response, slowest requests, journey duration per case; k6 load test marked "not run" | `/api/runs/{run}/perf` | — (bar/timeline charts) | M |
| 10 | **Security** | P1–P9 results (pass/fail per rule, not just failures), severity donut, cookies seen, pages checked, evidence links | `/api/runs/{run}/security` | Attack-surface graph | M |
| 11 | **Compatibility** | browser/OS actually used (Chromium on Windows), viewport; matrix with other browsers "not run" | `/api/runs/{run}/environment` | — | S |
| 12 | Network | ✅ done; add per-case filter | exists | Service map, API graph | S |
| 13 | Analytics | ✅ done | exists | Evidence network | — |
| 14 | Board, Findings, Approvals | ✅ done | exists | — | — |
| 15 | Finding detail | add "journey" diagram for its case and a "back to run" link | exists + diagram | Journey | S |
| 16 | **Repair** | repairs for this run's findings: diagnosis, prompt, diff, guard flags, approval, outcome | `/api/runs/{run}/repairs` (wraps `/api/repairs`) | Root-cause graph | M |
| 17 | **Regression** | if the run is a regression run: baseline → rerun per case; otherwise the run's cases across this project's last 20 runs | exists (`/runs/{id}/comparison`, `/projects/{id}/history`) | Regression diff | M |
| 18 | Projects | the run's project: environments, repo, last runs, pass-rate trend; no demo fallback | `/api/projects` + history | — | S |
| 19 | Policies | policy decisions made for this run (allow/deny, obligations) + workspace allowlist/roles | `/api/runs/{run}/policy` | — | S |
| 20 | Settings / Integrations | workspace-wide by nature; show "used in this run": models and costs, Slack/Jira notifications sent | `/api/runs/{run}/usage` | — | S |
| 21 | Copilot (Ask Trevyn) | answers about the selected run (run id sent as context) | `/api/assistant/chat` + run id | — | S |

## 6. Small data additions (so the pages are complete)

1. **Runner:** record `resourceType` (document, xhr, fetch, script, image) and response size in `network.json`. API testing
   needs xhr/fetch, Performance needs page weight.
2. **Runner:** record navigation timing per `goto` (DOMContentLoaded, load) in the step event data. Performance uses it.
3. **Runner:** record browser name/version, OS and viewport in the run's first event. Compatibility uses it.
4. **Passive lane:** store the **passed** rules too (a JSON summary evidence), so Security shows "6/9 checks passed", not
   only failures.

All are additive and old runs simply show "not recorded for this run".

## 7. Order of work

| Phase | What | Exit check |
|---|---|---|
| **A. Scope plumbing** | Project ▾ / Run ▾ picker, `useScope()`, latest-run default, cookie, every page wrapper (§3) | switching run changes the run id shown in every page header |
| **B. Run views API** | `run_views.py` endpoints (§5), `diagrams.py` | pytest: each endpoint returns only that run's data; unknown run returns 404 |
| **C. Quality Engineering pages** | live UI testing, API testing, Performance, Security, Compatibility + their diagrams | browser: pick run A then run B, every QE page changes; no `lib/demo` import in live paths |
| **D. Planner, Plans, Repair, Regression, Projects** | live views + diagrams | same browser check |
| **E. Runner additions** (§6) | resource type, timings, browser info, passed rules | a new run fills Performance/API/Compatibility tables |
| **F. Guard** | `scripts/check_no_demo.mjs` in CI: live code paths may not import demo data | CI fails on a demo import |

**Acceptance test** (`tests/manual_run_scope_pages.py`): starting from two real runs on different projects, visit all 20
pages with run A picked, record the run id and key numbers on each page, switch to run B, and assert every page changed
and shows run B's id. No console errors, and no demo strings ("ShopFlow", "RUN-04", "CHECKOUT-014 · WebKit").

## 8. Notes

- Restart the API after each phase. The UI only follows the picker once the new endpoints are running.
- Engines not built yet (k6 load, contract tests, cross-browser, ZAP active scan) show honest "not run" sections fed by the
  same run. Building them later only adds data, not pages.
