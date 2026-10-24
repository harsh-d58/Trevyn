// Run pages demo data, ported from trevyn-app/src/pages/Runs.jsx.
import type { ScriptEntry } from "../types"

/** Run ledger timeline (Gantt): seconds per phase */
export const PHASES: [string, string, string][] = [
  ["q", "Queued", "bg-muted-foreground/40"], ["plan", "Plan (AI)", "bg-ai/70"], ["gate", "Approval wait", "bg-human/80"],
  ["exec", "Execute", "bg-det"], ["ver", "Verify & evidence", "bg-brand/80"],
]
export const TIMELINE: { id: string; name: string; status: "passed" | "failed" | "warn"; duration: string; seg: [string, number][] }[] = [
  { id: "RUN-0412", name: "Checkout flow · PR #318", status: "failed", duration: "6m 12s", seg: [["q", 8], ["plan", 41], ["gate", 34], ["exec", 238], ["ver", 51]] },
  { id: "RUN-0411", name: "Authentication smoke", status: "passed", duration: "1m 47s", seg: [["q", 4], ["plan", 12], ["exec", 78], ["ver", 13]] },
  { id: "RUN-0410", name: "Cross-browser · catalog", status: "warn", duration: "8m 03s", seg: [["q", 22], ["plan", 38], ["exec", 371], ["ver", 52]] },
  { id: "RUN-0409", name: "API contract tests", status: "passed", duration: "0m 58s", seg: [["q", 3], ["plan", 6], ["exec", 41], ["ver", 8]] },
  { id: "RUN-0408", name: "k6 load · cart at 200 VUs", status: "failed", duration: "12m 30s", seg: [["q", 15], ["plan", 25], ["exec", 660], ["ver", 50]] },
  { id: "RUN-0407", name: "ZAP baseline + Semgrep", status: "warn", duration: "9m 14s", seg: [["q", 11], ["plan", 30], ["gate", 48], ["exec", 413], ["ver", 52]] },
]
export const TRIGGER_TONE: Record<string, string> = { "GitHub Actions": "text-det", Manual: "text-brand", Nightly: "text-ai", Scheduled: "text-muted-foreground" }
export const RUN_KPIS: [string, string, string, string][] = [
  ["Runs this week", "37", "12 triggered by PRs", "det"], ["Median duration", "6m 05s", "−48 s vs last week", "ok"],
  ["Inconclusive results", "3", "Flagged, not hidden", "warn"], ["Worker utilisation", "68%", "3 of 4 Docker workers", "det"],
]

/** The one scripted live run. Each entry appears once `at` tests have executed; `tp` = tests/min after it. */
export const STAGES = ["Understand", "Plan", "Execute", "Verify", "Resolve"]
export const LIVE_SCRIPT: ScriptEntry[] = [
  { stage: 0, kind: "det", at: 0, tp: 0, text: "Run context created · policy bundle v12 loaded" },
  { stage: 0, kind: "det", at: 0, tp: 0, text: "OPA gate: staging.shopflow.demo is on the target allowlist" },
  { stage: 0, kind: "ai", at: 0, tp: 0, text: "Reading requirements REQ-CHK-001…004 and repo diff (14 files)" },
  { stage: 1, kind: "ai", at: 0, tp: 0, text: "Planner proposed 46 tests across UI, API and security" },
  { stage: 1, kind: "det", at: 0, tp: 0, text: "Plan schema validation: 46/46 valid, 2 duplicates merged" },
  { stage: 1, kind: "gate", at: 0, tp: 0, text: "2 high-impact tests touch the payment sandbox. Approval required.", fx: "gate" },
  { stage: 2, kind: "det", at: 1, tp: 12, text: "Playwright · chromium, firefox, webkit · 3 workers" },
  { stage: 2, kind: "det", at: 12, tp: 18, text: "API suite · 22 contract checks passed" },
  { stage: 2, kind: "det", at: 18, tp: 21, text: "ZAP baseline scan started in passive mode" },
  { stage: 2, kind: "bad", at: 24, tp: 16, text: "CHECKOUT-014 failed · 2 orders created for 1 click", fx: "fail" },
  { stage: 3, kind: "det", at: 28, tp: 7, text: "Reproducing CHECKOUT-014 · 3 of 3 runs reproduce", fx: "repro" },
  { stage: 3, kind: "det", at: 31, tp: 4, text: "Trace, HAR and DB diff attached to the evidence store" },
  { stage: 3, kind: "ai", at: 34, tp: 3, text: "Diagnosis: POST /orders has no idempotency key on retry (0.92)", fx: "diag" },
  { stage: 3, kind: "ai", at: 38, tp: 2, text: "CART-009 inconclusive · flaky network stub, marked uncertain", fx: "inconclusive" },
  { stage: 4, kind: "ai", at: 42, tp: 1, text: "Repair proposed for orders/service.py (+7 −1)" },
  { stage: 4, kind: "human", at: 44, tp: 0, text: "Patch queued for developer review", fx: "patch" },
  { stage: 4, kind: "det", at: 46, tp: 0, text: "Run complete · 44 passed · 1 failed · 1 inconclusive", fx: "complete" },
]
/** evidence trail items light up once the log has more than `after` lines */
export const EVIDENCE_TRAIL: [string, string, number][] = [
  ["Screenshots", "6 frames · 3 engines", 9], ["Playwright trace", "checkout-014.trace.zip", 10], ["HAR capture", "checkout.har · 41 requests", 11],
  ["DB diff", "orders before/after", 11], ["Diagnosis", "idempotency · conf 0.92", 12],
]

/* ---- create test run wizard ---- */
export const WIZARD_STEPS = ["Application", "Requirements", "Testing mode", "Test suites", "Safety & execution"]
export const WIZARD_SUBS = [
  "Use staging and a dedicated test account. No live connection is made in this demo.",
  "Trevyn reads these with the repo diff and flags ambiguities before it plans.",
  "Choose how much context the test engine may use. Access determines coverage.",
  "Trevyn coordinates mature engines. It does not replace them.",
  "Every run passes the OPA policy gate before any worker starts.",
]
export const SUITES: { key: SuiteKey; title: string; desc: string; eta: string }[] = [
  { key: "ui", title: "Browser & UI", desc: "Playwright · chromium, firefox, webkit", eta: "~4 min" },
  { key: "apis", title: "API & unit", desc: "pytest · Vitest · JUnit · contract checks", eta: "~1 min" },
  { key: "perf", title: "Performance", desc: "k6 · thresholds on p95 and error rate", eta: "~12 min" },
  { key: "sec", title: "Security", desc: "OWASP ZAP passive · Semgrep", eta: "~9 min" },
  { key: "compat", title: "Compatibility", desc: "Cross-OS CI matrix", eta: "~15 min" },
]
export const MODES: { key: Mode; title: string; desc: string; access: string }[] = [
  { key: "black", title: "Black-box", desc: "Tests externally visible behaviour without source code access.", access: "Approved URL and test account" },
  { key: "gray", title: "Gray-box", desc: "Combines external behaviour with selected internal information.", access: "API schema, selected logs and limited metadata" },
  { key: "white", title: "White-box", desc: "Inspects source code and tests with repository access and tooling.", access: "Repository read scope and source-level tools" },
]
export const ATTACHMENTS: [string, string, string][] = [["checkout_acceptance.md", "Acceptance criteria", "Parsed"], ["openapi.yaml", "API contract", "Parsed"], ["PR #318 diff", "Code change", "14 files"]]

export type Mode = "black" | "gray" | "white"
export type SuiteKey = "ui" | "apis" | "perf" | "sec" | "compat"
export type Env = "staging" | "qa" | "prod"
export type RunConfig = {
  name: string; env: Env; url: string; repo: string; branch: string; acct: string; secret: string; req: string; mode: Mode
  suites: Record<SuiteKey, boolean>; budget: number; workers: number; synthetic: boolean; stopcrit: boolean
}
export const WIZARD_DEFAULTS: RunConfig = {
  name: "", env: "staging", url: "", repo: "", branch: "",
  acct: "", secret: "", req: "",
  mode: "gray", suites: { ui: true, apis: true, perf: false, sec: true, compat: false }, budget: 15, workers: 3, synthetic: true, stopcrit: true,
}
