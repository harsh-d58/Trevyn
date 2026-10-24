// Server-only getters backed by services/api (Part 16). Fall back to demo data when the API is off or unreachable.
import { cacheLife } from "next/cache"
import { apiEnabled, tryApi, type ApiFindingDetail, type Items } from "./api"
import { getWorkspace as demoWorkspace } from "./data"
import type { Approval, DashboardSummary, Finding, RunSummary, Workspace } from "./types"

/** Seeds the live store: GET /api/findings, /api/runs, /api/approvals?status=pending */
async function cachedGetWorkspace(): Promise<Workspace> {
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
async function cachedGetLiveFinding(id: string) {
  "use cache"
  cacheLife("seconds")
  return tryApi<ApiFindingDetail>(`/api/findings/${encodeURIComponent(id)}`)
}

/** Overview: real KPIs, gate, run health and categories from GET /api/dashboard/overview; null when the API is off */
async function cachedGetLiveOverview(): Promise<Pick<DashboardSummary, "kpis" | "gate" | "runHealth" | "categories"> | null> {
  "use cache"
  cacheLife("seconds")
  return tryApi("/api/dashboard/overview")
}

export type ApiPlanSummary = {
  id: string; version: number; parent_plan_id: string | null; status: string; source: string
  requirement: string; risk_level: string; cases: number; created_at: string
}
/** Plans list from GET /api/plans; null when the API is off or unreachable */
async function cachedGetLivePlans() {
  "use cache"
  cacheLife("seconds")
  return tryApi<Items<ApiPlanSummary>>("/api/plans")
}

// Demo mode never calls the cached getters, so prerendering has no short-lived cache entries to miss.
export async function getWorkspace(): Promise<Workspace> { return apiEnabled ? cachedGetWorkspace() : demoWorkspace() }
export async function getLiveFinding(id: string) { return apiEnabled ? cachedGetLiveFinding(id) : null }
export async function getLiveOverview() { return apiEnabled ? cachedGetLiveOverview() : null }
export async function getLivePlans() { return apiEnabled ? cachedGetLivePlans() : null }
