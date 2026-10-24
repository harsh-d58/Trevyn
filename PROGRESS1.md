# Progress 1 — handover for a new agent session

## Update — Phase 2 deep pipeline built (24 Oct 2026)

Covers [PLAN_MODES.md](PLAN_MODES.md) §3–6, plus Phase 1 items A6 (safe retest) and A7 (passive checks).

- **Graph** (`workers/orchestrator/trevyn_orch/graph.py`): parent graph `intake → recon (subgraph: site_map, repo_map only in gray box) → gate → [lane_ui ∥ lane_passive] (Send fan-out, join) → verify (subgraph: collect, classify, traffic, record) → report`. `TOPOLOGY` describes this graph for the UI. Every node logs a `node` event (start/end/waiting/failed); lanes log `lane` progress; after each case the UI lane logs a `screenshot` event.
- **Passive checks** (`trevyn_orch/passive.py`, A7): P1 CSP, P2 framing, P3 HSTS, P4 nosniff, P5 session cookie flags and P6 version leak come from up to 5 same-site GETs (redirects off the allowlist stop the fetch). P7 mixed content, P8 console errors and P9 5xx come from the UI lane's captured traffic. Each issue becomes a confirmed finding with category `security`/`network`/`ui`, the rule's severity, and a JSON evidence file.
- **Safe retest** (A6, `pipeline._repeat_policy`): with a reset hook, failures repeat after a reset. On live sites only read-only, non-high-risk cases repeat; anything that changes data is reported `not_repeated: changes data`.
- **Workspace events** (`services/api/trevyn_api/events.py`, table `workspace_events`, **migration `0005`**):
  - Published events: `run_created`, `run_state`, `finding_created`, `finding_updated`, `approval_created`, `approval_decided`, `plan_ready` and `plan_updated`.
  - `GET /api/events?after_id=&project=` returns the feed; `GET /api/events/stream` streams it over SSE (ticket auth, Redis channel `workspace` or in-process).
  - `GET /api/runs/{id}/graph` returns the topology with node and lane status.
- **Frontend:**
  - `lib/live.tsx` `useWorkspaceEvents` keeps one stream per tab. On events it debounces a refetch of findings, runs and approvals into the store, calls `router.refresh()`, and flashes the island.
  - `components/runs/run-graph.tsx` adds the graph map, lanes panel and screenshot strip (fetched with the bearer token) to the live run page; `node` events are hidden from the run log.
- **Verified:**
  - 84 Python tests pass (new: `tests/test_deep_pipeline.py`).
  - Both e2e scripts pass on an isolated API, SQLite and no Redis. Golden path: DEF-142 confirmed plus 3 passive findings. Repair loop: 5/5 PASS.
  - TypeScript, ESLint and `next build` pass.
  - Browser check on `/runs/live` during a new run: workspace stream opened; graph nodes all `done`; both lanes 2/2 and 1/1; 2 screenshots shown.
- **Display IDs are workspace-wide.** Before this fix, RUN-, DEF-, AP- and RP- numbers were counted per project, so a second project reused RUN-2481 and DEF-142. That caused duplicate React keys and ambiguous `/findings/DEF-142` links.
  - `runs.next_display` now takes the highest number across the whole workspace.
  - **Migration `0006`** renumbers existing duplicates (the oldest row keeps its ID) and adds unique indexes. It was tested on a seeded SQLite DB, including downgrade.
- **Not verified:** Supabase + Redis + Celery worker with the new graph; a live public site with passive checks. Apply `alembic upgrade head` (0005 + 0006) before starting this API against Postgres.

## Update — live URL build started (24 Oct 2026)

### Public GitHub connection added

- A project can link a **public GitHub repository** through `PUT /api/projects/{id}/repository`. Trevyn verifies the repository and ref through GitHub's API, follows GitHub's canonical rename, stores the commit SHA and a bounded file map, and shows the connection on the live Projects and Plans pages.
- The new-run wizard sends the repository URL and optional ref before planning. Gray-box plans receive the repository file map as untrusted observed context; browser cases still run against the authorised site URL. Repository test scripts are suggested, not executed by the API.
- Signed GitHub pull-request webhooks now select the project by its connected repository instead of selecting the first project.
- Migration `0004_repository` is required before starting the updated API against Postgres. It passed a fresh SQLite migration test; it has not been applied to Supabase.
- Verified with public `https://github.com/harsh-d58/Trevyn` (the old remote redirects there): commit `04a1210522b773dc09007939ad3029480c369e05`, 236 files indexed. A detached clone of that commit passed 65 Python tests using its own code and test database.
- **Famous live pair:** `https://todomvc.com/examples/react/dist/` + `https://github.com/tastejs/todomvc` at `ff43b02e59dfa604386bb382034b2cd07c2bcd8a` (4,495 files). The repository map prioritises `examples/react/src/` and excludes checked-in dependency folders. `tests/manual_todomvc_pair.py` passed a real add-todo browser journey (3 steps, 2 assertions). `tests/manual_todomvc_api.py` exercised project creation, repo connection, site discovery, Gray-box plan persistence, approval and execution on an isolated SQLite DB: 2 passed, 0 failed, 0 inconclusive. The no-AI fallback still uses smoke cases; repository test scripts are not run automatically.
- **Checks:** the local workspace passes 77 Python tests; TypeScript and ESLint pass.

- **A1, code ready:** `/readyz` reports the provider and planner model; `scripts/check_models.py` checks configured gateway model IDs and structured JSON for all four nodes. Live verification is pending because OpenRouter rejects the current `LLM_API_KEY` with HTTP 401; use no-AI mode meanwhile.
- **A2, first working slice:** URL projects are scanned in a read-only Chromium or installed Chrome browser before planning. The scan is limited to 10 same-site pages, depth 2 and 60 seconds, cached for one hour, and linked immutably to the plan. The plan page shows "What Trevyn saw" and offers re-scan. Login is detected, but credential-based discovery remains A4.
- **A3, first working slice:** URL-mode plans receive the observed site map; deterministic validation rejects unobserved routes and controls, reset steps, database assertions and off-site navigation. Write-like controls become high risk and wait for the existing human gate. A missing AI key or empty scan still produces only the honest smoke plan.
- **Schema:** migration `0003_site_maps` must be applied to Postgres with `alembic upgrade head` before starting this version of the API. It passed a fresh SQLite migration test; it has not been applied to Supabase.
- **Checks:** 65 Python tests pass, including a local browser discovery check and API cache/refresh test; TypeScript check and ESLint pass. A live public-site run with a real model remains unverified.

Remaining Phase 1 work: A4 test credentials, A5 selector fallback, A6 safe retest, A7 passive checks and A8 project picker/history, plus live provider and practice-site verification.

> **Written:** 24 Oct 2026. **Purpose:** everything a new person or agent needs to take over Trevyn without re-reading the chat history.
> **Read next:** [README.md](README.md) (run commands, status table) · [PHASE1.md](PHASE1.md) (the next build phase: live-URL testing) · [PLAN_MODES.md](PLAN_MODES.md) (black/grey/white pipelines, LangGraph subgraphs, live pages) · [BACKEND_AND_REMAINING_WORK.md](BACKEND_AND_REMAINING_WORK.md) (original full blueprint).

---

## 1. What Trevyn is

An autonomous AI QA engineer for the CODE APEX 3.0 hackathon (iMocha track IM-02), team **Dimaag Ka Dahi**. Given a web app URL, an optional public GitHub repository, and a requirement in plain English, it plans tests, runs them in a real browser, verifies failures with evidence, proposes fixes, and proves fixes with a regression run. The repository connection currently contributes a file map to planning; Trevyn does not automatically execute repository scripts.

**Core principle, enforced in code:** *the AI proposes, deterministic software decides.* Models write plans, hypotheses, patches and summaries; software decides what runs, what counts as a confirmed bug, permissions, retries and budgets. A failed or unrunnable test is reported as *inconclusive*, never as passed.

---

## 2. Repository map

```text
Project_code/
├── apps/web/                          Next.js 16 dashboard (App Router, cacheComponents, React 19, Tailwind v4)
├── services/api/trevyn_api/           FastAPI control plane
│   ├── main.py          app, core routes (projects, plans, runs, SSE, findings, evidence, approvals, chat), router registration
│   ├── db.py            SQLAlchemy 2.0 models; SQLite locally, Postgres/Supabase via DATABASE_URL
│   ├── runs.py          RunCtx (state/log/gates/evidence/findings), dispatch (Celery or in-process), doorbell, reaper, resume
│   ├── worker.py        Celery app + tasks (run.execute, run.resume, run.regression, maintenance.reap_stale)
│   ├── repairs.py       repair loop: propose patch → diff guard → approval → regression run → comparison
│   ├── auth.py          AUTH_MODE=off|supabase, JWT verify, role table, /api/me, members, audit, SSE ticket
│   ├── policy.py        policy gate (Python rules, or OPA when OPA_URL is set); fails closed
│   ├── targets.py       SSRF guard (blocks private/metadata IPs unless ALLOW_PRIVATE_TARGETS=1)
│   ├── manifest.py      Ed25519-signed run manifests + verify
│   ├── plans_ext.py     plan list, edit-as-new-version, diff, runs per plan
│   ├── insights.py      /api/dashboard/overview, /api/insights/*, project history
│   ├── storage.py       evidence to S3/MinIO when S3_* set, else local disk; presign; retention purge
│   ├── integrations.py  GitHub webhook (HMAC), Jira issue creation, Slack notify, integrations status
│   ├── common.py        Problem (RFC 9457 errors), get_or_404 (uuid or display id)
│   └── migrations/      Alembic: 0001 core baseline, 0002 run cancel flag
├── workers/orchestrator/trevyn_orch/
│   ├── graph.py         LangGraph run graph (start → gate (interrupt) → run_cases → verify_report), checkpointer
│   ├── pipeline.py      state machine table + reusable run pieces
│   ├── planner.py       model plan → validator → repair round → template/smoke fallback
│   ├── verifier.py      deterministic checks V1–V7 → confirmed / needs_review / inconclusive / passed
│   ├── diagnose.py      hypotheses (labelled) + repair prompt
│   ├── diff_guard.py    refuses huge/secret/empty patches, flags test-file edits
│   ├── regression.py    regression case selection, run, comparison, outcome
│   └── models.py        model adapters: Anthropic, Gemini (google-genai), OpenAI-compatible (OpenRouter)
├── workers/playwright-runner/trevyn_runner/runner.py   step interpreter, evidence capture, allowlist guard, duplicate-POST detection
├── packages/contracts/trevyn_contracts/               shared Pydantic contracts → schemas/*.json
├── scenarios/demo-shop/demo_shop/                     planted-bug "ShopFlow" store (app.py routes + bugs, templates.py UI)
├── infra/docker-compose.yml                           redis (default), postgres/minio/opa (profile "full")
├── infra/opa/                                         trevyn.rego + trevyn_test.rego
├── tests/                                             unit tests + e2e scripts (see §8)
├── .github/workflows/                                 ci.yml, security.yml (never run on GitHub yet)
├── tasks.ps1                                          Windows task runner
├── PHASE1.md · PROGRESS1.md · README.md · BACKEND_AND_REMAINING_WORK.md · DASHBOARD_DESIGN_SPEC.md · GLASS_DESIGN_LANGUAGE.md · PORTING_PLAN.md
└── .env / .env.example                                config (.env is gitignored)
```

---

## 3. Status by build step

The 12 steps come from the "Trevyn Core Build Guide" (Claude Docs artifact https://claude.ai/artifact/4hwrGTJQgf1XoVVqVtSPvu; the docs connector was not always available in this session).

| Step | State | Verified how |
|---|---|---|
| 1 Database + migrations | ✅ Done | Alembic up/down/up on SQLite; applied on Supabase (16 tables, append-only triggers on run_events, audit_log, policy_decisions) |
| 2 Auth, roles, audit | ✅ Backend · ✅ login page + user menu | Unit tests (JWT, roles, SSE ticket). Supabase Auth never tried with a real project |
| 3 Job queue (Celery + Redis) | ✅ Done | Both e2e scripts passed through the Redis worker |
| 4 LangGraph orchestrator | ✅ Done | Graph unit tests; a gated run survived an API restart. Postgres checkpointer untested (Windows uses SQLite, see §7) |
| 5 Plan lifecycle | ✅ API · ⚠ UI lists/approves only | No edit/diff screen |
| 6 Repair + regression loop | ✅ Done | `tests/e2e_repair_loop.py` 5/5 checks. Works only on the demo shop (switches a planted-bug flag) |
| 7 Policy + security | ✅ OPA rego (5/5 tests), SSRF guard, signed manifests | OPA server mode not exercised by the API |
| 8 Evidence store | ✅ Code | Tested with a fake S3 client; never against MinIO/S3 |
| 9 Insights | ✅ API + Overview | Analytics/Network pages still on demo fixtures |
| 10 Frontend wiring | ✅ Runs, live run, findings, board, approvals, plans, repair panel, overview, audit | Typecheck, lint, `next build` clean |
| 11 Integrations | ✅ Code | Unit tests only (HMAC, Jira 503, status). No real GitHub/Slack/Jira |
| 12 CI + ops | ✅ Written | Workflows never run on GitHub |

**Not built at all:** k6, ZAP, Semgrep, OSV runners (Perf/Security/Compat pages say "Not run"); benchmark harness; Git clone/build in Docker; plan edit/diff UI; member role editor; explorer/page discovery; self-healing selectors; test-login fields (all planned in PHASE1.md).

---

## 4. How a run flows (current code)

1. **Wizard** (`apps/web/components/runs/new-run-view.tsx`): URL + "what to test" (+ optional repo). Black-box is recommended when no repo is given. Finds or creates the project by URL (`POST /api/projects`, `authorised: true`).
2. **Plan:** `POST /api/projects/{id}/plans` → `planner.generate()`:
   - AI available → structured plan, validated, one repair round;
   - no AI → **demo shop**: keyword templates; **any other site**: 2 smoke tests (home page 200, readable content).
3. **Approve:** `POST /api/plans/{id}/approve`.
4. **Run:** `POST /api/runs` (Idempotency-Key) → SSRF check → policy decision → `runs.dispatch("run")` → Celery task (REDIS_URL set) or in-process task.
5. **Graph** (`graph.py`): high-risk cases raise a LangGraph interrupt → run parks in `AWAITING_APPROVAL` holding no process → `POST /api/approvals/{id}/decision` dispatches `resume`.
6. **Runner** executes each case in Chromium, captures screenshots, trace, network and console logs; verifier classifies; diagnosis + repair prompt for failures; findings stored with evidence (hashed, local or S3).
7. **Live view:** `/runs/live?run=RUN-xxxx` streams `run_events` over SSE (Redis doorbell or in-memory; re-reads DB on every bell or every 5 s).
8. **Repair (demo shop only):** finding page → "Propose fix" → approve → regression child run → before/after → finding moves to `verified`.

---

## 5. Environment and services (this machine)

| Thing | State |
|---|---|
| OS / shells | Windows 11, Git Bash + PowerShell. Python 3.13 via `uv`, Node 24 |
| Database | **Supabase** via the **Session pooler**: `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.gwutfeufytlgcrdzwwdl`. Migrations at `0002`. The direct host `db.<ref>.supabase.co` is IPv6-only and unreachable here |
| Redis | Docker container `infra-redis-1` (redis:7) on 6379, healthy. `REDIS_URL=redis://localhost:6379/0` in `.env` |
| AI | `MODEL_PROVIDER=openrouter`, `LLM_API_KEY` **empty** (user will add). Without a key: templates/smoke + rule-based diagnosis; copilot returns 503 |
| Docker | Desktop installed. Its credential helper fails in non-interactive shells: pull images with `DOCKER_CONFIG` pointing at a folder containing `{}` |
| Ports | 3000 dashboard · 3100 demo shop · 8000 API · 6379 Redis |

**`.env` keys in use** (values never committed): `DATABASE_URL`, `REDIS_URL`, `EVIDENCE_DIR`, `CORS_ORIGINS`, `DEMO_SHOP_URL`, `BUGS`, `TREVYN_HOOK_TOKEN`, `MODEL_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MODEL_PLANNER|DIAGNOSTICIAN|FIX|ASSISTANT`, plus optional `ANTHROPIC_API_KEY`, `AUTH_MODE`, `SUPABASE_JWT_SECRET`/`SUPABASE_JWKS_URL`, `OPA_URL`, `S3_*`, `GITHUB_WEBHOOK_SECRET`, `SLACK_WEBHOOK_URL`, `JIRA_*`, `ALLOW_PRIVATE_TARGETS`, `CHECKPOINTER`. Web: `apps/web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000` (+ optional `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`).

**Security note:** the Supabase database password was shared in chat on 24 Oct; the user was advised to rotate it. In `DATABASE_URL` the password must be URL-encoded (`$`→`%24`, `#`→`%23`); the `.env` loader treats `#` as a comment start.

---

## 6. Run commands

```powershell
cd "E:\Harsh\VIT\TY\Code Apex 3.0\Project_code"
docker compose -f infra/docker-compose.yml up -d redis
uv run uvicorn demo_shop.app:app --port 3100
uv run uvicorn trevyn_api.main:app --port 8000
uv run celery -A trevyn_api.worker worker -Q orchestrator,maintenance --pool=solo --loglevel=info   # only with REDIS_URL
cd apps\web; npm run dev
```

Tests:

```powershell
$env:PYTHONIOENCODING="utf-8"
uv run pytest -q                                   # 57 unit tests
uv run python tests/e2e_golden_path.py             # needs shop + API (+ worker if REDIS_URL)
uv run python tests/e2e_repair_loop.py
uv run python tests/try_url.py https://www.saucedemo.com "Smoke test"   # any live URL
```

If `uv run` hangs (PyPI resets connections on this network), use `.venv\Scripts\python.exe -m …` or `uv run --no-sync`.

---

## 7. Gotchas learned the hard way

1. **IDs before flush:** SQLAlchemy `default=uid` is applied only at flush. Pass `id=uid()` explicitly when another row references the new id in the same transaction (caused two repair-loop bugs).
2. **Celery + asyncio:** each task runs `asyncio.run` on a fresh loop; async clients (Redis), locks and the DB pool are bound to the old loop. `worker._run` disposes the engine and resets `runs._redis`, `_seq_locks`, `_run_locks` after every task.
3. **Windows + Postgres checkpointer:** async psycopg cannot run on the Proactor event loop that Playwright needs. On Windows the LangGraph checkpointer uses `var/langgraph.db` (SQLite) even when the main DB is Postgres. Override with `CHECKPOINTER=postgres|sqlite`. Linux servers use Postgres by default.
4. **Next.js cacheComponents:** short-lived `"use cache"` getters must sit under `<Suspense>`; calling them while the API is off caused "cache miss after warming" during build. `lib/live-data.ts` now only calls cached getters when `apiEnabled`.
5. **Dashboard hydration:** the spotlight effect (`components/fx/fx-provider.tsx`) skips elements React has not hydrated yet.
6. **Duplicate React keys:** Recharts tick keys collided when chart data is mostly zero; run-health ticks are de-duplicated.
7. **Shell heredocs:** long Python heredocs with mixed quotes break in this Git Bash; write a script file instead.
8. **Display ids** (`RUN-2481`, `DEF-142`, `AP-n`, `RP-n`) are counted per project; IDs are unique per project, not globally.
9. **Demo shop bug flags** can be changed at runtime: `POST /__trevyn/bugs {"bugs":"all"}` restores every planted bug (the repair e2e does this at the end).

---

## 8. Tests

| File | Covers |
|---|---|
| `tests/test_core.py` | verifier rules, diff guard, regression classify/select/outcome, planner validator, SSRF guard, auth role table, JWT, SSE ticket, manifest signing |
| `tests/test_queue.py` | Redis doorbell (fakeredis), idempotent gates, cancel at a gate, restart survival, orphan reaping, local dispatch |
| `tests/test_graph.py` | LangGraph interrupt/resume (approve, reject, after simulated restart) |
| `tests/test_insights.py` | analytics, network, history endpoints |
| `tests/test_storage_integrations.py` | S3 storage (fake client), evidence URLs, GitHub HMAC, Jira, integrations status |
| `tests/conftest.py` | points tests at `var/test.db`, never the dev or Supabase DB |
| `tests/e2e_golden_path.py` | plan → approve → run on the demo shop; expects DEF-142 confirmed |
| `tests/e2e_repair_loop.py` | full repair loop; expects `verified`, baseline untouched, manifest verifies |
| `tests/try_url.py` | manual test of any live URL |

Last recorded checks (24 Oct, before the read-only audit in §14): 79 unit tests passed; targeted ESLint and `next build` passed; a read-only browser check switched between two UUID-linked runs without mixing logs. Earlier e2e scripts and a live Sauce Demo smoke run were reported successful, but they were not rerun in this audit.

---

## 9. Frontend notes

- Data seam: `lib/api.ts` (client fetch, Supabase bearer token when configured), `lib/live-data.ts` (live server getters; workspace seed is fetched at request time, other getters are cached), `lib/data.ts` + `lib/demo/*` (demo fixtures).
- "Live API data" / "Demo data" chip bottom-left shows which source the shell is using.
- Overview shows real KPIs, gate, run health and categories in live mode and hides cards with no data source (failing suites, throughput, week strip).
- Home page on desktop: greeting and project chip hidden; TREVYN wordmark top-left (`components/shell/wordmark.tsx`, loads `public/trevyn-logo.png`, falls back to text until the user saves the image there); section tabs sit in the top bar; the old "T" rail circle is removed.
- New run wizard: no pre-filled text; placeholders only; testing mode recommended from inputs.
- Repair panel on finding detail (`components/findings/repair-panel.tsx`).

---

## 10. Git state

- Remote: `https://github.com/harshgitty58/Trevyn.git`, branch `main`. The user commits and pushes manually.
- Last commit: `98866fb Complete core build: LangGraph, job queue, repair loop, policy, evidence, integrations, CI`.
- **Working tree on 24 Oct:** uncommitted live-URL, public GitHub repository, live-run UI/backend, tests, and documentation changes are present. Use `git status --short` for the current file list; this audit did not commit or discard any of them.
- `.env`, `apps/web/.env.local` and `var/` are gitignored (verified).

---

## 11. Decisions made with the user

1. Live-URL testing is the first prototype focus; Git/repo testing comes later.
2. Black-box is the default when only a URL is given.
3. AI provider: one multi-model gateway key (OpenRouter-style) via `MODEL_PROVIDER=openrouter`; famous models pre-filled per task in `.env` (planner/diagnostician `anthropic/claude-sonnet-4`, fix `openai/gpt-4o`, assistant `google/gemini-2.5-flash`). Model ids must be checked against the gateway once the key exists.
4. The user creates infrastructure (Supabase, Redis, keys) personally; agents verify and wire code.
5. Honest positioning: do not claim "no competitors"; lead with evidence-backed verdicts, proved fixes, governance and self-hosting.
6. Security testing today covers roughly 5–10% of OWASP Top 10 for target apps; passive checks (PHASE1 A7) are the first improvement.

---

## 12. What to do next

Follow [PHASE1.md](PHASE1.md) from the current implementation: finish A1 (working model IDs and structured output); then A4 test login, A5 selector fallback, A6 safe retest, A7 passive checks, and A8 project picker/history. A2 bounded discovery and A3 URL planner rules are implemented. Phase B remains later work.

Before changing these areas, check `git status`; this workspace contains uncommitted pipeline and live-run work. The current audit below is read-only and did not run tests or services.

---

## 13. Live Runs update (24 Oct)

- In live API mode, `/runs/live` refreshes the run list every 3 seconds and selects an active run. `?run=<uuid>` pins a specific run while other runs continue; switching closes the prior stream and opens that run's own stream.
- The run log loads persisted events first, then uses SSE with sequence-based catch-up. Reconnects get a fresh stream ticket for authenticated deployments. Run links from the wizard, ledger, findings, and regression panel use the stable UUID.
- Verdict counts are persisted during execution, so the ledger and selected run update before completion. The scripted demo remains available only in demo mode.
- `tests/test_queue.py` verifies two concurrent run streams have isolated events and counts, and two separate OS processes write to their own run logs. Latest verification: 79 tests passed, targeted ESLint passed, and `next build` completed cleanly.
- `tests/manual_live_runs_ui.py` checked the running browser tab read-only: two existing UUID-linked runs were selectable and showed only their own persisted events.
- Event sequence allocation locks the parent run row in Postgres and retries uniqueness conflicts, so concurrent API and worker processes cannot silently reuse one sequence number.
- For multiple authenticated API processes, set one shared `TICKET_SECRET` on all of them. Set one shared `REDIS_URL` on API and workers for immediate cross-process event wakeups; the event stream also polls persisted events as a fallback.

---

## 14. Main pipeline static audit (24 Oct; no run in this audit)

This section records what is wired in the current codebase. It does not claim a fresh end-to-end run or a working AI provider.

| Mode | Current status | Actual behavior |
|---|---|---|
| Black box | Implemented for a public live URL | Bounded read-only site discovery feeds browser test planning. Playwright runs whitelisted steps against the URL, records evidence, and deterministic rules decide verdicts. With no usable planner model, non-demo sites get two generic start-page smoke cases, regardless of the requirement. |
| Gray box | Partial planning enrichment | Requires a verified public GitHub repository. Its pinned commit and file/path map are saved with the plan and passed to the planner. Execution is still the same URL browser runner. Repository tests are suggested only; no clone, source execution, code coverage, or automatic repository test run occurs. With model fallback, the repository map does not make the two smoke cases more specific. |
| White box | Not implemented as a live mode | The live wizard disables it. The API can accept the label on a hook-configured environment, but there is no source-level planner or executor. An externally supplied hook also skips site discovery while execution only forwards hooks marked `local_runner`, so this is not a reliable external white-box route. |

**Wired path:** the wizard finds or creates a URL project, optionally connects a public GitHub repository, scans up to 10 same-site pages (depth 2, 60 seconds; GET/HEAD), generates and validates a plan, approves it automatically, and creates a run. The API checks URL/host policy; local tasks or Celery workers execute a checkpointed graph. High-risk cases pause for an approval. The Chromium Playwright runner interprets steps, collects screenshots/traces/network/console evidence, evaluates assertions, and writes per-run events. Rules classify results as passed, confirmed, needs review, or inconclusive; diagnosis and a repair prompt use AI when available and deterministic/template fallbacks otherwise. Findings, live per-run SSE logs, counts, evidence access, and an on-demand signed final manifest are wired.

**Conditional or limited:** model-based, requirement-specific planning and diagnosis depend on a provider returning valid schema output. The last user-provided model check reported planner/diagnostician model IDs missing and structured JSON failing for fix/assistant; this audit did not retry them. Retesting a failed case for 2/2 reproduction requires the demo/test hook; arbitrary live URLs are not safely retried yet. Patch proposals, human approval, and regression execution work only for planted demo-shop bug flags. A public GitHub connection does not enable applying a fix to that repository.

**Wizard and Phase 1 gaps:** live wizard suite toggles, time budget, parallel-worker count, synthetic-data and stop-on-critical switches, and Save draft are not submitted to the API. The staging/QA choice is not submitted either; choosing production is blocked in the wizard, while the backend's local policy only records a production-approval obligation and does not itself enforce a separate production gate. Test-account/secret fields are disabled in live mode. There is no live-site login secret flow (A4), selector healing (A5), safe live-site retest (A6), or passive security/network finding rules (A7). Project cards are real, but the project picker, project-scoped history/filtering, and edit endpoint in A8 are incomplete. Other suite pages and charts still contain demo data. Display IDs are count-derived and can repeat; UUIDs identify runs in the Live Runs tab.

**Trust boundaries:** creating a project requires the caller to assert authorization, but the wizard sends `authorised: true` and the API does not independently prove ownership. GitHub verifies that the repository is public and resolves a commit; it does not establish that the repository is the code deployed at the supplied URL.

### Full quality-pipeline completion checklist

**Current answer: no.** LangGraph execution, database records, and black-box browser checks are implemented, but the three modes and the complete quality-check suite are not linked end to end.

1. Make all configured planner/diagnostician/fix models return valid structured output; keep the generic smoke fallback clearly labelled. The last reported model check did not pass.
2. Define and enforce a real mode contract in plan, graph, runner jobs, and results. Black box should use the URL; gray box should use verified repository insights beyond file names; white box needs an isolated checkout, source-aware analysis and test execution. The current graph executes the same browser path for every mode.
3. Replace demo-only values and paths: `qa@shop.test` credentials and ShopFlow templates, planted-bug patch flags, static wizard attachments, and charts/pages using demo data. Connect an authorized test-account secret flow without leaking credentials into prompts or evidence.
4. Send and enforce wizard settings in the API and workers: selected suites, environment, time budget, worker count, synthetic-data rule, stop criteria, and saved drafts. Keep plan review explicit rather than automatically approving every wizard-created plan.
5. Complete live-site safety and quality checks: safe failure retest, selector fallback with recorded healing, passive security/network rules, and production approval enforcement. Add actual API, performance, security and compatibility executors before presenting their suite switches as active.
6. Build a real repository repair path: isolated code changes, diff checks, human approval, repository/CI integration, and regression proof. Current patch/regression implementation only switches demo-shop bug flags.
7. Verify deployment state: apply and inspect migrations in the configured database, use a shared LangGraph checkpointer for workers on different machines (Windows currently defaults to a local SQLite checkpoint), tighten project isolation and display-ID allocation, and verify Redis/Celery concurrency and restart/resume behavior.
8. Run end-to-end checks for each mode on authorized targets with a real database and multiple workers. Unit tests and the earlier browser smoke check do not establish full three-mode quality coverage.

---

## 15. Run scope implementation (24 Oct 2026)

The work in `RUN_SCOPE_PLAN.md` is now wired in code. In live API mode the top bar has a project picker and a run picker; the selected project's latest run is the default. The cookie, client store, server pages, and `/api/runs?project=` use the same selection. The shared workspace header displays the current run on every page. Runs ledger pins the selected run and compares it with the previous run in that project.

Run-specific API projections now serve plan/version diff, planner inputs, UI steps and evidence, same-host XHR/fetch API calls, measured navigation/request timings, passive security rules, browser environment, repairs, regression comparison/history, policy decisions, and model usage. Every new projection uses `load_run_bundle()` and returns 404 for an unknown run. Diagrams for pipeline, site map, coverage, journey, API/service, security, evidence, root cause, regression, and repository data are generated server-side from the same records. The new isolation test creates two projects/runs and checks that all projections and coverage diagrams stay within their selected run.

Planner, Plans, UI testing, API testing, Performance, Security, Compatibility, Repair, Regression, Policies, Settings, and Integrations now render live API results when API mode is on. Overview no longer reads a demo snapshot in API mode, and finding detail no longer falls back to a demo finding. Network can filter by case and shows run-generated service/API diagrams. Projects shows the selected run's project and its recent pass rates. Copilot now receives the chosen run ID and a run-scoped snapshot. Existing live Overview, Analytics, Network, Board, Findings, Approvals, and Live run paths continue to use the chosen run. `scripts/check_no_demo.mjs` is wired into web CI for live-only components and the live empty state.

New runs record Playwright request resource type, response `Content-Length` when available, navigation timings, browser version/OS/viewport, and passed as well as failed passive rules P1-P9. Old runs report missing measurements instead of inventing values. `responseBytes` is the response header size when supplied; chunked responses without that header remain unmeasured. Local and S3 network evidence are readable by the live network view. A selected project with no runs shows empty run data rather than workspace-wide numbers. k6 load tests, API contract tests, active security scanning, and other browsers remain unimplemented and are labelled “not run.”

Verification after these changes: TypeScript check and Next production build passed; Ruff `F,E9` passed; `scripts/check_no_demo.mjs` passed; 92 Python tests passed, including the new run isolation test. Targeted graph/pipeline/isolation tests passed (15). `tests/manual_run_scope_pages.py` is ready for two existing real runs on different projects, but the 21-page browser acceptance has not been run: neither service was listening locally, and the local database has three runs in only one project. End-to-end data completeness still depends on a new run and a reachable API/database/evidence store.

---

## 16. Industry-standard quality lanes: codebase check and current work (24 Oct 2026)

The attached master prompt was checked against the current graph, runner, evidence store, per-run API views, and live pages. The existing pipeline had Chromium UI and P1-P9 passive checks, but no ZAP, Lighthouse, axe, cross-browser, HAR, OSV-Scanner, or Gitleaks execution lane before this work. The gray-box repository map is pinned in the plan, but it is not a repository scanner.

| Feature | Current state | Remaining work |
|---|---|---|
| F1 ZAP passive baseline | ZAP parser and graph lane wired; Docker errors become lane warnings, P1-P9 stay active; run-scoped Security exposes alerts, CWE and rule state. The persisted report strips request data and URL queries. | Real scan on the demo shop is pending the official image pull. Review egress limits for unusual IP-literal redirects. |
| F2 Lighthouse + web-vitals | Bounded Lighthouse lane and Chromium debug-port runner wired for the start page and up to three scanned pages. Browser journeys inject vendored web-vitals. Performance shows measured score, metrics, opportunities and budget findings. | Local demo-shop Lighthouse audit succeeded; still verify run-scoped page output on two runs. Chrome DNS rules block hosts outside the allowlist, but an IP-literal redirect needs an additional network guard. |
| F3 Firefox/WebKit/mobile + axe | Graph lane replays cases without marked side effects in Firefox, WebKit and an iPhone 13 preset, storing a matrix; Chromium injects vendored axe-core after each goto and records WCAG 2.1 A/AA violations as evidence and accessibility findings. Compatibility and UI projections show these records. | Firefox/WebKit binaries are absent in this workspace, so all three variants returned `infra_error` in the smoke attempt. Verify after installing browsers, and check that cases are correctly labelled read-only. |
| F4 HAR + trace | Runner captures a HAR per case, strips headers/cookies/bodies/query strings, and publishes it with the existing trace. Network insights prefer HAR timings and fall back to `network.json`; the page has download/view links. Local Chromium smoke created a valid HAR 1.2 and trace. | Verify the trace viewer link and HAR download from a reachable deployment. |
| F5 OSV-Scanner + Gitleaks | Gray-box graph lane verifies a shallow checkout's pinned SHA, runs installed CLI scanners without executing repository code, stores OSV JSON and a redacted Gitleaks report, creates security findings, and projects them on Security and Planner. | Neither scanner binary is installed here; saved parser samples pass, but a vulnerable-lockfile scan remains unverified. |

Verification after all five lane implementations: 104 Python tests passed, including saved parser samples for ZAP, Lighthouse, web-vitals, compatibility, axe, HAR, OSV and Gitleaks; Ruff `F,E9` passed on touched Python files; `tsc --noEmit` and the Next production build passed. A local demo-shop Chromium case passed and wrote HAR, trace, axe and web-vitals artifacts with measured LCP, CLS and TTFB; INP was correctly not run without an interaction. A direct Lighthouse audit of the local shop measured one page and returned a real score. An initial full-suite failure exposed older runs with multiple network files for one case; HAR-first reading now tries each evidence file until it finds a valid capture, and the full suite passes. The web package has no `typecheck` npm script, so TypeScript was invoked directly. Golden-path e2e and browser run-picker checks still need a running API, web app, and two projects with runs. No commit or push was performed.
