// Server-only getters backed by services/api. Demo fixtures are used only when API mode is disabled.
import { cacheLife } from "next/cache"
import { apiEnabled, tryApi, type ApiFindingDetail, type Items } from "./api"
import { runParam } from "./scope"
import { getWorkspace as demoWorkspace } from "./data"
import type { Approval, DashboardSummary, Finding, RunSummary, Workspace } from "./types"

/** Seeds the live store: GET /api/findings, /api/runs, /api/approvals?status=pending */
async function liveGetWorkspace(run: string | null, project: string | null): Promise<Workspace> {
  if (!run) {
    const empty = await emptyLiveWorkspace()
    const runs = await tryApi<Items<RunSummary>>(`/api/runs${project ? `?project=${encodeURIComponent(project)}` : ""}`)
    return { ...empty, runs: runs?.items ?? [], scope: null, project }
  }
  const [findings, runs, approvals, overview] = await Promise.all([
    tryApi<Items<Finding>>(`/api/findings${runParam(run)}`), tryApi<Items<RunSummary>>(`/api/runs${project ? `?project=${encodeURIComponent(project)}` : ""}`),
    tryApi<Items<Approval>>(`/api/approvals?status=pending${runParam(run, "&")}`), tryApi<Pick<DashboardSummary, "loop">>(`/api/dashboard/overview${runParam(run)}`),
  ])
  const empty = await emptyLiveWorkspace()
  // A failed read shows as empty (and the live feed refills it), never as demo data with real runs mixed in
  return { ...empty, summary: { ...empty.summary, loop: overview?.loop ?? empty.summary.loop },
    findings: findings?.items ?? [], runs: runs?.items ?? [], approvals: approvals?.items ?? [], scope: run, project }
}

/** The shape of a workspace with nothing loaded yet, in live mode: the layout's first paint and failed reads. */
export async function emptyLiveWorkspace(): Promise<Workspace> {
  return { summary: { kpis: [], runHealth: [], categories: [], topSuites: [], throughput: [], week: [],
    gate: { passRate: 0, gate: 0, passed: 0, failed: 0, release: "No run", weekDelta: 0 },
    loop: { plan: [0, 0], prove: [0, 0], decide: [0, 0] } },
    findings: [], runs: [], approvals: [], source: "live" }
}

/** GET /api/findings/{id}, or null for demo / unknown ids */
async function cachedGetLiveFinding(id: string) {
  "use cache"
  cacheLife("seconds")
  return tryApi<ApiFindingDetail>(`/api/findings/${encodeURIComponent(id)}`)
}

/** Overview: real KPIs, gate, run health and categories from GET /api/dashboard/overview; null when the API is off */
async function cachedGetLiveOverview(run: string | null): Promise<Pick<DashboardSummary, "kpis" | "gate" | "runHealth" | "categories"> | null> {
  "use cache"
  cacheLife("seconds")
  return tryApi(`/api/dashboard/overview${runParam(run)}`)
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
export async function getWorkspace(run: string | null = null, project: string | null = null): Promise<Workspace> { return apiEnabled ? liveGetWorkspace(run, project) : demoWorkspace() }
export async function getLiveFinding(id: string) { return apiEnabled ? cachedGetLiveFinding(id) : null }
export async function getLiveOverview(run: string | null = null) { return apiEnabled ? cachedGetLiveOverview(run) : null }
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
async function cachedGetLiveAnalytics(run: string | null) {
  "use cache"
  cacheLife("seconds")
  return tryApi<LiveAnalytics>(`/api/insights/analytics${runParam(run)}`)
}
/** Analytics from GET /api/insights/analytics (one run when `run` is set); null when the API is off or unreachable */
export async function getLiveAnalytics(run: string | null = null) { return apiEnabled ? cachedGetLiveAnalytics(run) : null }

export type LiveNetwork = {
  files: number
  cases: string[]
  selectedCase: string | null
  artifacts: { case: string; har: string | null; trace: string | null }[]
  endpoints: { method: string; path: string; requests: number; errors: number; duplicatePosts: number; p50: number | null; p95: number | null }[]
  statusCodes: Record<string, number>
  waterfall: { case: string; requests: { t: number; ms?: number; method: string; path: string; status?: number }[] } | null
  totals: { requests: number; errors: number; duplicatePosts: number }
  /** the run these numbers belong to; null = all runs */
  scope?: { run: string; uuid: string; name: string } | null
}
async function cachedGetLiveNetwork(run: string | null) {
  "use cache"
  cacheLife("seconds")
  return tryApi<LiveNetwork>(`/api/insights/network${runParam(run)}`)
}
/** Network from GET /api/insights/network (one run when `run` is set); null when the API is off or unreachable */
export async function getLiveNetwork(run: string | null = null) { return apiEnabled ? cachedGetLiveNetwork(run) : null }
