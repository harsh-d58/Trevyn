// Shared demo entities for the ShopFlow Commerce workspace, ported from trevyn-app/src/data.js.
// Every date is anchored to DEMO_TODAY so "Today", "Yesterday" and 30-day ranges agree across pages.
import type { Approval, BoardColumn, Finding, RunSummary } from "../types"

export const DEMO_TODAY = Date.UTC(2026, 9, 21)
export const DAY = 86_400_000
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
/** last n days ending today, as ISO dates */
export const lastDays = (n: number) => Array.from({ length: n }, (_, i) => iso(DEMO_TODAY - (n - 1 - i) * DAY))

/** deterministic pseudo-random so server and client render the same series */
export function seeded(seed: number) {
  let h = seed
  return () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) % 1000) / 1000
}

export const PEOPLE: Record<string, string> = { AC: "Alex Chen", PR: "Priya Rao", MK: "Marcus Kim", SN: "Sara Nair" }
export const PROJECTS: Record<string, string> = { ShopFlow: "var(--cat-ui)", PayGrid: "var(--det)", Mediq: "var(--cat-sec)", Learnly: "var(--ai)", FleetOps: "var(--human)" }

export const COLUMNS: [BoardColumn, string][] = [
  ["triage", "Triage"], ["investigating", "Investigating"], ["repair", "Repair proposed"],
  ["approval", "Awaiting approval"], ["regression", "Regression rerun"], ["verified", "Verified"],
]
export const columnName = (k: BoardColumn) => COLUMNS.find((c) => c[0] === k)?.[1] ?? k

const F = (id: string, title: string, severity: Finding["severity"], type: Finding["type"], column: BoardColumn, confidence: number, evidence: number, owner: string, runId: string, inconclusive = false): Finding =>
  ({ id, title, severity, type, column, confidence, evidence, owner, runId, verdict: inconclusive ? "inconclusive" : confidence > 85 ? "confirmed" : "likely" })

export const FINDINGS: Finding[] = [
  F("DEF-142", "Duplicate orders after checkout", "high", "ui", "approval", 92, 7, "PR", "RUN-0412"),
  F("DEF-141", "Missing CSRF token on /account/email", "high", "security", "repair", 88, 4, "SN", "RUN-0407"),
  F("DEF-139", "p95 latency 1.8 s on /api/cart at 200 VUs", "medium", "perf", "investigating", 74, 5, "PR", "RUN-0408"),
  F("DEF-138", "Coupon endpoint accepts negative discount", "medium", "api", "triage", 81, 3, "PR", "RUN-0409"),
  F("DEF-137", "Safari: address form loses focus on autofill", "low", "ui", "triage", 58, 2, "MK", "RUN-0410", true),
  F("DEF-135", "SQL string built from user input in search.py", "high", "security", "investigating", 90, 3, "SN", "RUN-0407"),
  F("DEF-136", "Order history paginates past the last page", "low", "ui", "regression", 95, 6, "MK", "RUN-0412"),
  F("DEF-130", "Login rate limit not enforced on /auth/token", "medium", "security", "regression", 86, 4, "SN", "RUN-0407"),
  F("DEF-129", "Cart badge count stale after removing an item", "low", "ui", "triage", 63, 2, "MK", "RUN-0412", true),
  F("DEF-133", "Payment webhook retried without idempotency key", "high", "api", "verified", 97, 8, "PR", "RUN-0409"),
  F("DEF-131", "Product images 4.2 MB on mobile viewport", "low", "perf", "verified", 99, 2, "MK", "RUN-0410"),
]

export const RUNS: RunSummary[] = [
  { id: "RUN-0413", name: "Checkout flow · PR #321", type: "ui", status: "running", passed: 26, total: 46, duration: "—", trigger: "GitHub Actions", started: "Today 10:52", people: ["PR", "AC"] },
  { id: "RUN-0412", name: "Checkout flow · PR #318", type: "ui", status: "failed", passed: 42, total: 46, duration: "6m 12s", trigger: "GitHub Actions", started: "Today 10:42", people: ["PR"] },
  { id: "RUN-0411", name: "Authentication smoke", type: "ui", status: "passed", passed: 18, total: 18, duration: "1m 47s", trigger: "Manual", started: "Today 09:58", people: ["MK"] },
  { id: "RUN-0410", name: "Cross-browser · catalog", type: "compat", status: "warn", passed: 31, total: 33, duration: "8m 03s", trigger: "Nightly", started: "Today 09:20", people: ["MK"] },
  { id: "RUN-0409", name: "API contract tests", type: "api", status: "passed", passed: 22, total: 22, duration: "0m 58s", trigger: "GitHub Actions", started: "Today 08:41", people: ["MK", "PR"] },
  { id: "RUN-0408", name: "k6 load · cart at 200 VUs", type: "perf", status: "failed", passed: 3, total: 4, duration: "12m 30s", trigger: "Scheduled", started: "Oct 20", people: ["PR"] },
  { id: "RUN-0407", name: "ZAP baseline + Semgrep", type: "security", status: "warn", passed: 11, total: 13, duration: "9m 14s", trigger: "Nightly", started: "Oct 20", people: ["SN"] },
]

export const APPROVALS: Approval[] = [
  { id: "AP-31", title: "Patch for DEF-142 in orders/service.py (+7 −1)", why: "Regression 46/46 passed on the patched build", category: "Accepting patches", project: "ShopFlow", priority: "high", risk: "medium", when: "Today", who: "PR", href: "/repair" },
  { id: "AP-30", title: "Run payment sandbox refund tests PAY-007, PAY-008", why: "Touches a third-party sandbox and sends customer emails", category: "High-impact tests", project: "PayGrid", priority: "urgent", risk: "high", when: "Today", who: "AC" },
  { id: "AP-27", title: "Authenticated ZAP active scan on /account/*", why: "Active scan sends attack payloads to staging", category: "High-impact tests", project: "ShopFlow", priority: "high", risk: "medium", when: "Oct 20", who: "SN" },
  { id: "AP-29", title: "DEF-137 · Safari autofill focus loss", why: "Confidence 58%. Reproduced in 1 of 3 runs", category: "Uncertain diagnoses", project: "ShopFlow", priority: "low", risk: "low", when: "Oct 19", who: "MK", href: "/findings/DEF-137" },
]

/** created by the Overview hero's "Request release approval" */
export const RELEASE_APPROVAL: Approval = { id: "AP-28", title: "Promote release 2.14.0 to production", why: "1 high security finding still open (DEF-141)", category: "Release and risk calls", project: "ShopFlow", priority: "urgent", risk: "high", when: "Just now", who: "AC" }

/** raised when a live run reaches its high-impact test gate */
export const gateApproval = (runId: string): Approval => ({
  id: `GATE-${runId.slice(4)}`, title: `${runId} · 2 high-impact tests touch the payment sandbox`, why: "Refund tests PAY-007 and PAY-008 send customer emails",
  category: "High-impact tests", project: "ShopFlow", priority: "urgent", risk: "high", when: "Just now", who: "AC", href: "/runs/live",
})

export const NOTIFICATIONS: { kind: "ai" | "det" | "human" | "bad"; text: string; when: string }[] = [
  { kind: "ai", text: "Trevyn diagnosed DEF-142 with 92% confidence", when: "4 min ago" },
  { kind: "human", text: "Priya requested review on patch AP-31", when: "11 min ago" },
  { kind: "det", text: "RUN-0412 finished · 42/46 passed", when: "18 min ago" },
  { kind: "bad", text: "k6 threshold breached on /api/cart", when: "Yesterday" },
  { kind: "det", text: "Nightly compatibility matrix completed", when: "Yesterday" },
]

export const DEMO_PROJECTS: { name: string; desc: string; pass: number; spark: number[]; open: number; env: string; run: string }[] = [
  { name: "ShopFlow Commerce", desc: "E-commerce web app · Next.js", pass: 91.4, spark: [88, 89, 87, 90, 91, 90, 92, 91], open: 6, env: "Staging", run: "RUN-0413" },
  { name: "PayGrid API", desc: "Payments REST API · FastAPI", pass: 97.8, spark: [95, 96, 97, 96, 98, 97, 98, 98], open: 1, env: "QA", run: "RUN-0398" },
  { name: "Mediq Patient Portal", desc: "Healthcare portal · React", pass: 86.2, spark: [90, 88, 87, 85, 86, 84, 86, 86], open: 9, env: "Staging", run: "RUN-0385" },
  { name: "Learnly LMS", desc: "Learning platform · Django", pass: 93.1, spark: [89, 90, 92, 91, 93, 92, 93, 93], open: 3, env: "Staging", run: "RUN-0377" },
  { name: "FleetOps Mobile", desc: "Logistics PWA · Vue", pass: 88.7, spark: [84, 85, 86, 88, 87, 89, 88, 89], open: 4, env: "QA", run: "RUN-0371" },
]
