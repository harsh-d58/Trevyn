# Progress 1 — handover for a new agent session

## Update — live URL build started (24 Oct 2026)

- **A1, code ready:** `/readyz` reports the provider and planner model; `scripts/check_models.py` checks configured gateway model IDs and structured JSON for all four nodes. Live verification is pending because `LLM_API_KEY` is empty on this machine.
- **A2, first working slice:** URL projects are scanned in a read-only Chromium or installed Chrome browser before planning. The scan is limited to 10 same-site pages, depth 2 and 60 seconds, cached for one hour, and linked immutably to the plan. The plan page shows "What Trevyn saw" and offers re-scan. Login is detected, but credential-based discovery remains A4.
- **A3, first working slice:** URL-mode plans receive the observed site map; deterministic validation rejects unobserved routes and controls, reset steps, database assertions and off-site navigation. Write-like controls become high risk and wait for the existing human gate. A missing AI key or empty scan still produces only the honest smoke plan.
- **Schema:** migration `0003_site_maps` must be applied to Postgres with `alembic upgrade head` before starting this version of the API. It passed a fresh SQLite migration test; it has not been applied to Supabase.
- **Checks:** 65 Python tests pass, including a local browser discovery check and API cache/refresh test; TypeScript check and ESLint pass. A live public-site run with a real model remains unverified.

Remaining Phase 1 work: A4 test credentials, A5 selector fallback, A6 safe retest, A7 passive checks and A8 project picker/history, plus live provider and practice-site verification.

> **Written:** 24 Oct 2026. **Purpose:** everything a new person or agent needs to take over Trevyn without re-reading the chat history.
> **Read next:** [README.md](README.md) (run commands, status table) · [PHASE1.md](PHASE1.md) (the next build phase: live-URL testing) · [BACKEND_AND_REMAINING_WORK.md](BACKEND_AND_REMAINING_WORK.md) (original full blueprint).

---

## 1. What Trevyn is

An autonomous AI QA engineer for the CODE APEX 3.0 hackathon (iMocha track IM-02), team **Dimaag Ka Dahi**. Given a web app (a URL today; a Git repo later) and a requirement in plain English, it plans tests, runs them in a real browser, verifies failures with evidence, proposes fixes, and proves fixes with a regression run.

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

Last results (24 Oct): 57/57 unit tests; both e2e scripts pass in local and Redis mode; live run against saucedemo.com on Supabase + Redis + worker passed its smoke tests; OPA tests 5/5; web typecheck, lint, `next build` clean.

---

## 9. Frontend notes

- Data seam: `lib/api.ts` (client fetch, Supabase bearer token when configured), `lib/live-data.ts` (server getters, cached, only when `NEXT_PUBLIC_API_URL` set), `lib/data.ts` + `lib/demo/*` (demo fixtures).
- "Live API data" / "Demo data" chip bottom-left shows which source the shell is using.
- Overview shows real KPIs, gate, run health and categories in live mode and hides cards with no data source (failing suites, throughput, week strip).
- Home page on desktop: greeting and project chip hidden; TREVYN wordmark top-left (`components/shell/wordmark.tsx`, loads `public/trevyn-logo.png`, falls back to text until the user saves the image there); section tabs sit in the top bar; the old "T" rail circle is removed.
- New run wizard: no pre-filled text; placeholders only; testing mode recommended from inputs.
- Repair panel on finding detail (`components/findings/repair-panel.tsx`).

---

## 10. Git state

- Remote: `https://github.com/harshgitty58/Trevyn.git`, branch `main`. The user commits and pushes manually.
- Last commit: `98866fb Complete core build: LangGraph, job queue, repair loop, policy, evidence, integrations, CI`.
- **Uncommitted at time of writing:** Windows checkpointer fix, smoke-plan fallback, OpenAI-compatible adapter + `.env.example` names, live-URL wizard changes (blank fields, URL-based project, mode suggestion), desktop header changes (wordmark, tabs, hidden greeting/chip), run-health tick fix, `tests/try_url.py`, `PHASE1.md`, `PROGRESS1.md`.
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

Follow [PHASE1.md](PHASE1.md) in this order: A1 (AI key + `scripts/check_models.py`) → A7 passive checks and A8 project picker (parallel) → A2 discovery → A3 URL-mode rules → A4 test login → A5 selector fallback → A6 safe retest → Phase B.

Before starting: run `uv run pytest -q` and `tests/e2e_golden_path.py` to confirm the baseline still passes, and check `git status` to see whether the uncommitted work in §10 was committed.
