<#
  Windows task runner (Makefile equivalent).
  Usage: .\tasks.ps1 <task>
  Tasks: up | migrate | test | e2e | api | shop | worker | web
#>
param([Parameter(Position = 0)][ValidateSet("up", "migrate", "test", "e2e", "api", "shop", "worker", "web", "help")][string]$Task = "help")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

switch ($Task) {
    "up"      { docker compose -f infra/docker-compose.yml up -d redis }
    "migrate" { uv run alembic upgrade head }
    "test"    { uv run pytest -q }
    "e2e"     { uv run python tests/e2e_repair_loop.py }
    "api"     { uv run uvicorn trevyn_api.main:app --port 8000 }
    "shop"    { uv run uvicorn demo_shop.app:app --port 3100 }
    "worker"  { uv run celery -A trevyn_api.worker worker -Q orchestrator,maintenance --pool=solo }
    "web"     { Set-Location apps/web; npm run dev }
    default   { Get-Help $PSCommandPath; Write-Output "Tasks: up, migrate, test, e2e, api, shop, worker, web" }
}
