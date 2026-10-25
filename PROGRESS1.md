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

## 17. Queue recovery (25 Oct 2026)

RUN-2496 was blocked behind a solo Celery worker waiting for an orphaned earlier queued run. Blocking queue waits also prevented maintenance from executing. Celery now releases the worker through a three-second retry when another run owns the slot; queued retries skip validation and duplicate deliveries for active/terminal runs are ignored. The incident also exposed Supabase's 15-client session-pooler limit. Postgres engines now default to three pooled connections with zero overflow per process (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`). API and worker were restarted; stale RUN-2494 was cleaned up, and the latest approved plan was retried as RUN-2497 after the failed runs retained their error histories. API health, worker ping and pool size were verified. All 115 Python tests and targeted Ruff checks passed. See `independent_engines.md` for the incident details.

## 18. Supabase pooler follow-up (25 Oct 2026)

RUN-2496's recorded `EMAXCONNSESSION` failure came from the Supabase session endpoint (`:5432`, 15-client limit). The local `DATABASE_URL` now uses the transaction endpoint (`:6543`), and the example configuration shows that port. The asyncpg engine disables both statement caches for transaction mode and gives SQLAlchemy's prepared statements unique names. API and worker keep a bounded three-connection pool with zero overflow; an attempted unbounded connection strategy caused DNS failures under dashboard traffic and was replaced. Alembic uses the session endpoint for migrations. The run-event SSE route now closes its initial lookup session before streaming. Both services were restarted. Eight concurrent run-list requests and `/readyz` returned 200; the run SSE returned event 240. All 115 Python tests and Ruff checks passed. RUN-2497 completed with 15 passed and one failed test case; its report finished.

## 19. Live-run findings panel (25 Oct 2026)

The "Findings from this run" card is fixed at 360 px high. Its findings list scrolls inside the card, with a keyboard-focusable scroll region. TypeScript and focused ESLint checks passed.

## 20. Findings category crash (25 Oct 2026)

The live API returned `accessibility` for 120 findings, but the frontend finding-type map omitted it and crashed while rendering the Findings page. Accessibility now has a pill, filter, and chart color; unknown future categories fall back to a readable pill label. TypeScript and focused ESLint checks passed. The live `/findings` page loaded in Chrome with no page errors, and the Accessibility filter showed 55 rows in the selected scope.

## 21. Plain-language findings (25 Oct 2026)

The Findings page now leads with short, user-facing explanations of the observed issue and its possible impact. It groups similar checks within a run, sorts high-priority groups first, and keeps every original finding ID, tool title, evidence count, and detail link in an expandable section. Search matches both plain and technical wording. The summary cards show grouped issue counts, high-priority groups, review-needed groups, and groups with evidence; the misleading average AI confidence card is removed. Live finding detail pages open with the same plain-language explanation and keep the original title available. On the selected live run, 76 individual findings displayed as 24 groups. Browser checks confirmed list search, expansion, detail navigation, and no page errors; TypeScript and focused ESLint passed.

## 22. Browser and UI quality page (25 Oct 2026)

The live Browser & UI testing page now explains the run result before showing records. It separates failed planned checks from accessibility scanner observations and browser console messages, gives the failed check a data-derived explanation and next step, and links its screenshot and recording. Pages and journeys show simple actions and expected outcomes with original tool output available on demand. Accessibility and console messages are grouped into human-readable patterns rather than dumped as raw rows. Screenshots and recordings remain available. Every content card has a fixed height with an internal scroll region; coverage and journey diagrams are last and also scroll within fixed-height cards. Shared live quality sections use bounded scrolling and place diagrams after their data. RUN-2498 showed 15/16 checks passed, one missing-text check, 55 accessibility observations, and 35 browser errors with context. Chrome rendered the UI and Performance pages without page errors; the Pages and journeys region measured 275 px visible / 1021 px scrollable. TypeScript and focused ESLint passed.

## 23. Performance quality page (25 Oct 2026)

The live Performance testing page now uses the selected run's browser vitals, Lighthouse audits, request timings, and navigation timings to explain what slowed down and where. It opens with measured impact, groups repeated budget misses by page and metric, explains each measurement in plain language, and gives cautious next checks without presenting network requests as proven causes. Browser visits and separate Lighthouse lab audits have distinct sections. Per-page values, full audit evidence, and original request paths remain available in expandable rows. Missing interaction timing and the absent load test are called out explicitly. Every content card has a fixed height and keyboard-focusable internal scroll; the performance map is last in a fixed-height scroll card. On RUN-2498, the page showed 8 of 16 measured views over the main-content target, 6 slow first responses, one layout-shift miss, and four Lighthouse audits. Chrome rendered Performance and Browser & UI pages without page errors; the priority, request, navigation, and map regions had content taller than their visible areas. TypeScript and focused ESLint passed. No commit or push was performed.

The response-time bar graph was restored inside the slow network requests card. Each bar compares a captured request with the longest request in the selected run, while the readable resource name, time, size, and original path remain available. TypeScript and focused ESLint passed after the change.

## 24. Network quality page (25 Oct 2026)

The live Network & traces page now leads with a plain-language summary of captured browser traffic and a short list of signals needing review. It distinguishes HTTP 4xx/5xx errors from requests whose HAR has no usable response status, and avoids treating the latter as confirmed site failures. Response-status bars, p95 timing bars, and the request waterfall remain visible with explanations of what their lengths and colors mean. Paths use readable file names, with full paths and timings available on expansion; the complete endpoint list can be searched. HAR downloads and browser traces remain linked. Every content card has a fixed height with internal scrolling, while service and API diagrams appear after the written results in fixed-height scroll cards. The journey selector continues to fetch data and diagrams for the chosen case. On RUN-2498, the page showed 633 requests across 16 journeys, zero recorded HTTP 4xx/5xx responses, and 35 entries with unavailable status. Chrome rendered the page without errors; selecting SMOKE-001 changed the summary to 44 requests in one journey, and path search narrowed 98 endpoint groups to two matches. TypeScript and focused ESLint passed. No commit or push was performed.

## 25. Security and Compatibility quality pages (25 Oct 2026)

Security now opens with the outcome of the run's passive checks, then explains each flagged finding in plain language with direct evidence links. A separate list describes the nine passive rules and distinguishes flagged, passed, and not-applicable results. Scanner coverage explicitly shows when ZAP, dependency advisory, or exposed-secret scans did not run; sampled pages and any scanner/repository findings remain available. Compatibility now separates completed browser replays from missing results, shows browser-by-browser coverage, explains timeouts and replay exclusions, and lets users expand each case to compare Firefox, desktop WebKit, and mobile WebKit. Accessibility scanner observations are grouped and explained separately from cross-browser pass/fail results. All cards have fixed heights with internal scrolling; diagrams follow the written results. On RUN-2498, Security displayed four flagged passive rules out of nine and three scanner lanes not run. Compatibility displayed 22 completed replays out of 48, with 26 not run, and 55 separate accessibility observations. Chrome rendered both pages without page errors; the Security findings/rules and Compatibility case/accessibility regions were confirmed scrollable, and a timed-out case showed its reason on expansion. TypeScript and focused ESLint passed. No commit or push was performed.

## 26. Quality Engineering copy cleanup (25 Oct 2026)

The live Browser & UI, API & integration, Performance, Security, Compatibility, and Network & traces pages now use concise page titles and card labels. Repeated run names, generic card captions, duplicate finding text, map prefaces, and scroll instructions were removed. Metric definitions and coverage caveats remain where needed to interpret results. Empty compatibility difference cards are hidden. The API page now shows one clear result when no same-site XHR/fetch traffic was captured, instead of repeating the reason beside empty Calls and Endpoints cards; detailed call and endpoint cards appear only when data exists. Its API map is hidden when no same-site endpoints were captured. All six live routes rendered in Chrome without page errors. TypeScript and focused ESLint passed. No commit or push was performed.

## 27. Five-step run wizard audit and clarity (25 Oct 2026)

The live wizard was checked against its launch payload, plan API, run creation, policy evaluator, execution graph and all five rendered steps. Only the application URL, optional run/new-project name, requirement, optional public GitHub URL/ref, and computed black/gray mode affect the launched run. A public repository is verified and pinned before gray-box planning. The live wizard automatically approves the generated plan; model failure can produce a generic smoke plan. White-box has no source-level planner or executor and remains disabled for public-URL runs.

The old live UI displayed demo staging/QA/production labels, example acceptance files and a hardcoded ambiguity, suite switches with demo engine names and durations, a 15-minute budget, a three-worker selector, synthetic-data and stop-on-critical toggles, a false policy pre-check, and a Save draft button that only showed a toast. None of those settings or claims was sent to the live run API. The run manifest also showed a fake draft ID and demo badge. Live mode now hides those elements and explains automatic lane selection, tool availability, queueing, actual high-risk approval behavior, and the absence of white-box source execution. The stepper labels earlier steps “Visited” rather than “Done,” without green completion checks. Launch is disabled until URL and requirement are entered. Demo-mode controls remain on the separate demo path.

Unresolved backend/product gaps: no per-run suite selection, worker count, total time budget, synthetic-data policy, stop-on-critical setting, persisted draft, or live login/secret connection; staging/QA is not a submitted environment choice. The project creation request still sends `authorised: true` as a self-assertion rather than proving ownership. The wizard still creates and approves a plan in one action without a review screen. API contract/unit suites and load testing are not launched by this flow; white-box source-level testing is not implemented. The queue intends one active run while LangGraph fans out lanes within it. Chrome inspection of all five steps and the required-field launch state passed without page errors; TypeScript and focused ESLint passed. No run was launched and no commit or push was performed.

## 28. Pitch deck review (25 Oct 2026)

Reviewed `Pitch Deck 1.pdf` (4 slides), `TREVYN_IM02_DimaagKaDahi.pdf` (11 slides), and `Pitch_Deckv1.pptx` (11 slides) against `independent_engines.md` and the current live-run audit. Recommended a nine-slide pitch led by a real run, the five verified engines (ZAP, Lighthouse/web vitals, Firefox/WebKit/mobile with axe, HAR/traces, OSV/Gitleaks), their concrete outputs, and a reproducible case study. The PPTX still has a prototype placeholder and placeholder team/contact fields, whereas the PDF includes screenshots and member names. Deck claims to remove or mark as roadmap: unmeasured DevTools coverage percentages, browser extension, k6/load and API/unit automation from the live URL flow, Semgrep, full white-box execution, automatic public-repository repair, and enterprise security controls not verified in the current product. Keep references as footnotes/backup, not a full slide in a sub-10-slide pitch. This was a read-only deck review; no presentation file was edited.

Also reviewed `template.pdf` (8 pages). It provides the Code Apex black/deep-green background, neon-green headings/rules, VIT/AISF and event logos, and required sections: team details, problem, solution, architecture/stack, features/UI, roadmap, impact, and thanks. Design recommendation: use those event elements, readable plain sans-serif body copy, strong screenshot contrast, and one additional template-styled proof slide to make a nine-slide deck. Fit the five verified engines and their outputs into the architecture and features sections; replace the old generic slide order with the template's order. No template or presentation file was edited.

## 29. Pitch deck built and claim audit (25 Oct 2026)

Created `output/presentation/Trevyn_Code_Apex_Pitch.pptx`: nine editable, template-styled slides covering the problem, workflow, five quality engines and their outputs, an illustrative simulated finding, measured RUN-2498 results, implementation scope, impact, and the team. Slide notes cite the supporting local sources. The simulated finding is labelled as such; the separate real-run slide reports 15/16 planned browser checks passed, 55 accessibility observations, 633 requests, four Lighthouse audits, and the incomplete browser replay/scanner coverage. All nine slide previews were visually reviewed. The final package passed integrity, geometry, heading-fit, font-policy, and artifact import checks. No commit or push was performed.

Audited the requested product claims against code. Regression after an approved fix is implemented for planted demo-shop bugs, not arbitrary public repositories. Eligible failing browser cases can be repeated and receive evidence-based verdicts; unsafe side-effect cases without a reset hook are held for review. The finding detail shows expected versus observed outcomes, reproduction steps, evidence, and labelled diagnostic hypotheses, with plain-language mappings for common finding types. Recent quality and findings page copy is simpler, but no usability study is recorded. The demo shop has seeded bug toggles and a repair loop, but no general fake-bug precision/recall benchmark. A test case's expected assertion, passive rule, or budget is the comparison baseline, and the live wizard currently autoapproves generated plans, so an incorrect oracle remains possible.

## 30. Quality Engineering pre-run projects (25 Oct 2026)

The six live Quality Engineering routes were checked for a selected project with no run. Previously, Browser & UI, API & integration, Performance, Security, and Compatibility stopped at a generic no-run card, while Network & traces stopped at a separate empty message. Neither path fetched the connected project's saved details. A shared pre-run view now loads the selected project, target environments and allowed domains, connected public repository and pinned commit, latest project plan and its cases, and any saved site discovery through the live API. Every lane states that it has no measured result until a run records one; optional scanners, contract tests and load tests are not presented as completed. Missing project, unavailable API, absent plan and absent site scan have distinct messages. When no project or run cookie exists and there are no runs yet, server scope now selects the newest connected project instead of returning no project.

Verification: TypeScript, focused ESLint, and the Next production build passed. With a temporary local API simulation containing one connected project, an approved one-case plan, a two-page site map and no runs, all six production routes returned 200 and rendered the real project name, URL, plan and no-run state. The default no-cookie route selected that project as well. The temporary simulation was stopped and removed, then the Next build was restored using the normal local environment. A real database-backed pre-run project was not available during this check. No commit or push was performed.

## 31. Project dropdown recency (25 Oct 2026)

The live project dropdown now places the project with the most recently started run first. `/api/projects` supplies each project's `last_run_at` from a grouped database query; projects with no runs remain below projects with runs. The dropdown refreshes the project list whenever it opens, so a newly started run can change the order without a page reload. Selection and the existing project details are unchanged.

Verification: the Next production build, focused ESLint, Ruff, and `tests/test_run_views.py` passed. The API response was checked against the isolated SQLite test database and returned timestamps for both projects with runs. The first pytest attempt failed before executing a test because the system temp directory was denied; rerunning with a workspace temp directory passed. No commit or push was performed.

## 32. One project and run selector (25 Oct 2026)

The two live header dropdowns overlapped: choosing a project already chose that project's newest run, while the separate run dropdown selected history within that project. They are now one selector in the right header position. Its pill shows the selected project and run; its menu lists projects in latest-run order, then recent runs within the selected project. Choosing a project still selects its newest run, and choosing a historical run still scopes all run-driven pages. The demo-only project selector remains separate in demo mode. The store now immediately uses the newly fetched project run summary when switching projects, so the pill shows a display ID instead of a temporary UUID prefix.

Verification: TypeScript, focused ESLint and the Next production build passed. The live route rendered one combined selector and no old selector buttons. A local headless Chrome check opened the menu, confirmed both sections, selected a historical run, then switched projects; the pill updated to the correct project and `RUN-2492` display ID. No commit or push was performed.

## 33. Workspace corner controls removed (25 Oct 2026)

Removed the shared copilot render from the workspace layout. This removes the fixed `Live API data`/`Demo data` badge and the `Ask Trevyn` floating button from all workspace pages, as well as the panel opened by that button. The assistant API and component source were not changed. The Next production build and focused ESLint passed. Headless Chrome on the live Browser & UI route found zero `Ask Trevyn` buttons, zero `Live API data` labels, and zero copilot panels. No commit or push was performed.

## 34. Repository-backed fix capability and Flash Flood assertion (25 Oct 2026)

Audited the connected Flash Flood project's repository lookup, planner, diagnostician, fix assistant, repair API, and Browser & UI page. The public GitHub connection pins a commit and stores a file map plus suggested test commands. The planner can use that map in gray-box mode, but neither diagnosis nor the fix assistant fetches source-file contents. The saved `DEF-432` repair prompt is a generic application-fix instruction, not corrected repository code; public-repository patching is not implemented. No hardcoded Flash Flood code fix was added to Quality Engineering.

The specific `PAGE-001` failure is a Trevyn test-oracle mismatch. Site discovery captured the headline with DOM `textContent` as `Flash floodsdon't wait.Neither should we.`, while the runner compared CSS-transformed, multiline `innerText` (`FLASH FLOODS\nDON'T WAIT.\nNEITHER SHOULD WE.`). For scanner-generated `SITEMAP` text assertions, the runner now reads `textContent`, matching the scanner's source. Other UI text assertions retain rendered `innerText` semantics. The two sitemap planner tests passed, and a headless Chrome probe reproduced the old false failure and confirmed the corrected comparison. The previously saved run and finding are historical records; a new run is needed to produce a new verdict. A repository-grounded corrected-code panel still requires safe source-file retrieval and a fix proposal based on those files.

## 35. Full codebase audit (25 Oct 2026)

Completed a read-only audit across the Python API, orchestrator, runner, policies, integrations, contracts, and Next.js UI. Full findings and priorities are in `CODEBASE_AUDIT_2026-10-25.md`. Python tests (115), the CI Python F/E9 lint gate, frontend TypeScript, ESLint, legacy-fixture check, and Next production build passed. A production browser sweep loaded all 22 main workspace routes without page errors or horizontal overflow. Broad Ruff found 186 diagnostics, mostly beyond the CI gate. Contract regeneration revealed four stale tracked JSON schemas, so the CI contracts job would fail; the audit restored the original schema bytes after comparison. OPA tests could not run because Docker daemon access was denied. A live read-only check confirmed that manifest verification accepts a newly generated caller key for an unchanged saved manifest. No application fix or commit was made during this audit.

## 36. Public deployment code preparation and checks (25 Oct 2026)

Prepared a root Docker image for the Python API, Celery worker and beat, including Chromium and Lighthouse, plus an optional Render Blueprint and deployment environment examples. Added Supabase cookie-based SSR auth forwarding so server-rendered live pages can authenticate to the API. Removed shared caching from authenticated reads. Public-mode startup now requires Postgres, Redis, S3, Supabase JWT verification, a signing key, an SSE ticket key and an exact CORS origin. Project intake validates every allowed domain, rejects remote hooks, and records a production flag; production side-effect obligations now reach the LangGraph approval gate. Manifest verification pins the server's key. S3-backed PDF reports redirect to their stored object rather than serving a deleted local file. Regenerated the four stale contract schemas.

Verification: 117 Python tests passed, frontend TypeScript, ESLint and Next production build passed, `git diff --check` passed, and `render.yaml` parsed. Broad Ruff still reports pre-existing style diagnostics. The Docker image and deployed Render/Vercel integration were not tested here. No deployment, commit or push was performed.
