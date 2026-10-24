// Server-only getters backed by services/api (Part 16). Fall back to demo data when the API is off or unreachable.
import { cacheLife } from "next/cache"
import { apiEnabled, tryApi, type ApiFindingDetail, type Items } from "./api"
import { getWorkspace as demoWorkspace } from "./data"
import type { Approval, DashboardSummary, Finding, RunSummary, Workspace } from "./types"

/** Seeds the live store: GET /api/findings, /api/runs, /api/approvals?status=pending */
async function liveGetWorkspace(): Promise<Workspace> {
  const [findings, runs, approvals, overview] = await Promise.all([
    tryApi<Items<Finding>>("/api/findings"), tryApi<Items<RunSummary>>("/api/runs"), tryApi<Items<Approval>>("/api/approvals?status=pending"),
    tryApi<Pick<DashboardSummary, "loop">>("/api/dashboard/overview"),
  ])
  const demo = await demoWorkspace()
  if (!findings || !runs || !approvals || !overview) return demo
  // Overview cards read /api/dashboard/overview directly; the summary carries only today's loop for the store
  return { ...demo, summary: { ...demo.summary, loop: overview.loop }, findings: findings.items, runs: runs.items, approvals: approvals.items, source: "live" }
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
export async function getWorkspace(): Promise<Workspace> { return apiEnabled ? liveGetWorkspace() : demoWorkspace() }
export async function getLiveFinding(id: string) { return apiEnabled ? cachedGetLiveFinding(id) : null }
export async function getLiveOverview() { return apiEnabled ? cachedGetLiveOverview() : null }
export async function getLivePlans() { return apiEnabled ? cachedGetLivePlans() : null }

export type LiveAnalytics = {
  flow: { detected: number; confirmed: number; needs_review: number; inconclusive: number; repaired: number; verified: number }
  heatmap: { weekday: number; hour: number; count: number }[]
  mttr: { week: string; mttrHours: number; count: number }[]
  totalCostUsd: number; policyDenials: number
  byType: { type: string; label: string; count: number }[]
  passRate30: { date: string; rate: number | null }[]
  flaky: { case: string; rate: number; passed: number; failed: number }[]
  evidence: { findings: { id: string; title: string; status: string; severity: string; kinds: Record<string, number> }[]; kinds: Record<string, number>; backed: number; uncertain: number }
  diagnoses: { total: number; ai: number }
}
async function cachedGetLiveAnalytics() {
  "use cache"
  cacheLife("seconds")
  return tryApi<LiveAnalytics>("/api/insights/analytics")
}
/** Analytics from GET /api/insights/analytics; null when the API is off or unreachable */
export async function getLiveAnalytics() { return apiEnabled ? cachedGetLiveAnalytics() : null }

export type LiveNetwork = {
  files: number
  endpoints: { method: string; path: string; requests: number; errors: number; duplicatePosts: number; p50: number | null; p95: number | null }[]
  statusCodes: Record<string, number>
  waterfall: { case: string; requests: { t: number; ms?: number; method: string; path: string; status?: number }[] } | null
  totals: { requests: number; errors: number; duplicatePosts: number }
}
async function cachedGetLiveNetwork() {
  "use cache"
  cacheLife("seconds")
  return tryApi<LiveNetwork>("/api/insights/network")
}
/** Network from GET /api/insights/network; null when the API is off or unreachable */
export async function getLiveNetwork() { return apiEnabled ? cachedGetLiveNetwork() : null }
