// Server-only getters backed by services/api (Part 16). Fall back to demo data when the API is off or unreachable.
import { cacheLife } from "next/cache"
import { tryApi, type ApiFindingDetail, type Items } from "./api"
import { getWorkspace as demoWorkspace } from "./data"
import type { Approval, Finding, RunSummary, Workspace } from "./types"

/** Seeds the live store: GET /api/findings, /api/runs, /api/approvals?status=pending */
export async function getWorkspace(): Promise<Workspace> {
  "use cache"
  cacheLife("seconds") // lists refresh within seconds; per-run updates arrive over SSE
  const [findings, runs, approvals] = await Promise.all([
    tryApi<Items<Finding>>("/api/findings"), tryApi<Items<RunSummary>>("/api/runs"), tryApi<Items<Approval>>("/api/approvals?status=pending"),
  ])
  const demo = await demoWorkspace()
  if (!findings || !runs || !approvals) return demo
  // KPIs/charts stay demo until /api/insights exists
  return { ...demo, findings: findings.items, runs: runs.items, approvals: approvals.items, source: "live" }
}

/** GET /api/findings/{id}, or null for demo / unknown ids */
export async function getLiveFinding(id: string) {
  "use cache"
  cacheLife("seconds")
  return tryApi<ApiFindingDetail>(`/api/findings/${encodeURIComponent(id)}`)
}
