// Mirrors the FastAPI/Pydantic contract (DASHBOARD_DESIGN_SPEC.md §5.4, project context §15).
// Replace with `openapi-typescript` output once services/api exposes /openapi.json.

export type Provenance = "ai" | "det" | "human"
export type Severity = "high" | "medium" | "low"
export type FindingType = "ui" | "api" | "perf" | "security" | "compat"

export type KpiKey = "tests_executed" | "pass_rate" | "confirmed_findings" | "regressions_prevented" | "pending_approvals"
export type Kpi = {
  key: KpiKey
  label: string
  value: number
  unit?: "%"
  delta: number
  deltaUnit: "%" | "pts"
  goodDirection: "up" | "down"
  href: string
}

export type RunHealthPoint = { date: string; passed: number; failed: number; runs: number }
export type CategorySlice = { type: FindingType; label: string; count: number; high: number }
export type SuiteFailure = { suite: string; icon: "cart" | "key" | "grid" | "card"; failures: number; share: number; tone: "bad" | "perf" | "ai" | "ui" }
export type GateStatus = { passRate: number; gate: number; passed: number; failed: number; release: string; weekDelta: number }
export type ThroughputPoint = { date: string; evidence: number }
export type WeekSlot = { day: string; date: string; verified: number; inconclusive: number; today?: boolean }

/* ---- findings (§15.4) ---- */
export type BoardColumn = "triage" | "investigating" | "repair" | "approval" | "regression" | "verified"
/** §3/§17: a failed test is not automatically a confirmed bug */
export type Verdict = "confirmed" | "likely" | "inconclusive"
export type Finding = {
  id: string
  title: string
  severity: Severity
  type: FindingType
  column: BoardColumn
  verdict: Verdict
  confidence: number
  evidence: number
  owner: string
  runId: string
}

/* ---- runs ---- */
export type RunStatus = "running" | "passed" | "failed" | "warn" | "stopped"
export type RunSummary = {
  id: string
  name: string
  type: FindingType
  status: RunStatus
  passed: number
  total: number
  duration: string
  trigger: string
  started: string
  people: string[]
}
/** one line of the scripted run log (prototype LiveRun LOG); `at` = tests executed before it appears */
export type LogKind = Provenance | "bad" | "gate"
export type ScriptEffect = "gate" | "fail" | "repro" | "diag" | "inconclusive" | "patch" | "complete"
export type ScriptEntry = { stage: 0 | 1 | 2 | 3 | 4; kind: LogKind; text: string; at: number; tp: number; fx?: ScriptEffect }

export type Approval = {
  id: string
  title: string
  why: string
  category: "Accepting patches" | "High-impact tests" | "Uncertain diagnoses" | "Release and risk calls"
  project: string
  priority: "urgent" | "high" | "low"
  risk: Severity
  when: string
  who: string
  href?: string
}

export type DashboardSummary = {
  kpis: Kpi[]
  runHealth: RunHealthPoint[]
  categories: CategorySlice[]
  topSuites: SuiteFailure[]
  gate: GateStatus
  throughput: ThroughputPoint[]
  week: WeekSlot[]
  loop: { plan: [number, number]; prove: [number, number]; decide: [number, number] }
}

/** everything the live store is seeded with (one request in production) */
export type Workspace = { summary: DashboardSummary; findings: Finding[]; runs: RunSummary[]; approvals: Approval[]; source?: "live" | "demo" }
