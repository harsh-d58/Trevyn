// Data seam. Pages only call these getters; each one names the FastAPI endpoint it becomes
// (project context §20). Until services/api exists they resolve demo data from lib/demo/*.
import { APPROVALS, FINDINGS, RUNS } from "./demo/core"
import { DEF_142, HAR } from "./demo/findings"
import { SUMMARY } from "./demo/overview"
import { PLAN, PLAN_CHECKS, PLAN_DONE_STAGES, PLAN_PIPELINE, REGRESSION, REGRESSION_KPIS } from "./demo/plans"
import { CHANGE_REQUEST, DIFF, RC_INFO, REPAIR_PROMPT, REPAIR_SUITES } from "./demo/repair"
import { RUN_KPIS, TIMELINE } from "./demo/runs"
import type { DashboardSummary, Workspace } from "./types"

export { NOTIFICATIONS, PEOPLE, PROJECTS, RELEASE_APPROVAL } from "./demo/core"

/** GET /api/dashboard/summary?range=30d (addition to §20) */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  return SUMMARY
}

/** Seeds the live store: GET /api/projects/{id}/findings, /api/runs?project=, /api/approvals */
export async function getWorkspace(): Promise<Workspace> {
  return { summary: SUMMARY, findings: FINDINGS, runs: RUNS, approvals: APPROVALS }
}

/** GET /api/runs (ledger extras: KPIs and phase timeline) */
export async function getRunLedger() {
  return { kpis: RUN_KPIS, timeline: TIMELINE }
}

/** GET /api/findings/{id} + its evidence objects. Only DEF-142 has captured evidence in the demo. */
export async function getFindingEvidence(id: string) {
  return { evidence: DEF_142, har: HAR, sample: id !== "DEF-142" }
}
export const findingIds = () => FINDINGS.map((f) => f.id)

/** GET /api/plans/{id} */
export async function getPlan() {
  return { pipeline: PLAN_PIPELINE, doneStages: PLAN_DONE_STAGES, rows: PLAN, checks: PLAN_CHECKS, proposed: 18, validated: 16 }
}

/** GET /api/projects/{id}/regression */
export async function getRegression() {
  return { kpis: REGRESSION_KPIS, rows: REGRESSION }
}

/** POST /api/findings/{id}/repair-prompt + /repair-proposals (read side) */
export async function getRepair() {
  return { diff: DIFF, prompt: REPAIR_PROMPT, changeRequest: CHANGE_REQUEST, rcInfo: RC_INFO, suites: REPAIR_SUITES }
}
