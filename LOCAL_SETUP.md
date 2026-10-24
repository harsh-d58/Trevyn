# Local setup

Prepared on Windows, 24 October 2026.

- Node 22.20.0 and npm 10.9.3 are available.
- Python 3.12.14 is installed in the project virtual environment, using the bundled runtime as its base.
- uv 0.13.5 is available at `.venv\Scripts\uv.exe`.
- Frontend dependencies were installed with a successful `npm ci` after repairing missing lockfile entries.
- Declared Python runtime/dev dependencies and editable Trevyn were installed. The Python lockfile now includes the previously missing `moto[s3]` dependencies.
- Playwright's required Chromium headless shell, FFmpeg and Winldd are installed in `var/playwright`. `.env` contains the browser path.
- `.env` and `apps/web/.env.local` are local, ignored files. No credentials were added to Git.
- SQLite and in-process orchestration are sufficient for the core app. Docker/Redis/Postgres/MinIO/OPA remain optional services.

Use three PowerShell terminals from the repository root:

```powershell
# API: http://localhost:8000/docs
.\.venv\Scripts\python.exe -m uvicorn trevyn_api.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Planted-bug web app: http://localhost:3100
.\.venv\Scripts\python.exe -m uvicorn demo_shop.app:app --host 127.0.0.1 --port 3100
```

```powershell
# Dashboard: http://localhost:3000
Set-Location apps/web
npm run dev
```

For the built dashboard, use `npm run start` from `apps/web` after `npm run build`.

Activate the environment to make local Python and uv available by name:

```powershell
.\.venv\Scripts\Activate.ps1
$env:PYTHONUTF8 = '1'
```

Verification commands:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check services workers packages scenarios --select F,E9
.\.venv\Scripts\uv.exe lock --check --offline --cache-dir var/uv-cache
```

Frontend: `npm run lint`, `npm run check:legacy`, `npm run build` from `apps/web`.

The primary Python file host failed during setup. Compatible locked wheels were downloaded through a working mirror and checked against the committed SHA-256 hashes. Existing Python versions and cross-platform artifacts were retained; final lockfile URLs use canonical PyPI locations. Local caches and installation helpers are under ignored `var/`.

See [the integration audit](APP_INTEGRATION_AUDIT.md) for implemented features, missing connections and test evidence. A running dashboard does not mean every page is connected to real execution.
