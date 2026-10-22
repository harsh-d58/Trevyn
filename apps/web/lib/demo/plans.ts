// Test plan + regression demo data, ported from trevyn-app/src/pages/Plans.jsx.
import type { Severity } from "../types"

export const PLAN_PIPELINE = ["Requirements", "Explore journeys", "Generate cases", "Validate preconditions", "Execute", "Verify failures", "Generate report"]
export const PLAN_DONE_STAGES = 4

export type PlanRow = { id: string; req: string; scenario: string; pre: string; expected: string; mode: string; priority: Severity; state: "Validated" | "Needs review" | "Needs approval" }
export const PLAN: PlanRow[] = [
  { id: "CHECKOUT-014", req: "REQ-CHK-003", scenario: "Single click places one order", pre: "Logged in, cart has 1 item", expected: "Exactly 1 order created", mode: "Gray-box", priority: "high", state: "Validated" },
  { id: "CHECKOUT-015", req: "REQ-CHK-003", scenario: "Retry after timeout does not duplicate", pre: "450 ms latency injected", expected: "Retry returns same order", mode: "Gray-box", priority: "high", state: "Validated" },
  { id: "AUTH-001", req: "REQ-AUTH-001", scenario: "Valid login", pre: "Active account", expected: "Authenticated session", mode: "Black-box", priority: "high", state: "Validated" },
  { id: "AUTH-004", req: "REQ-AUTH-002", scenario: "Locked account cannot log in", pre: "Account locked", expected: "Error shown, no session", mode: "Black-box", priority: "medium", state: "Validated" },
  { id: "CART-009", req: "REQ-CART-001", scenario: "Remove item updates badge", pre: "Cart has 2 items", expected: "Badge shows 1", mode: "Black-box", priority: "low", state: "Needs review" },
  { id: "PAY-007", req: "REQ-PAY-002", scenario: "Refund through sandbox", pre: "Paid order exists", expected: "Refund recorded", mode: "Gray-box", priority: "high", state: "Needs approval" },
  { id: "SEC-012", req: "REQ-SEC-001", scenario: "CSRF token on state changes", pre: "Logged in", expected: "403 without token", mode: "White-box", priority: "high", state: "Validated" },
]
export const PLAN_CHECKS: [string, "ok" | "warn"][] = [
  ["Requirements covered: 4 / 4", "ok"], ["All tests have executable preconditions", "ok"], ["No duplicate scenarios after merge", "ok"],
  ["CART-009 depends on a flaky network stub", "warn"], ["PAY-007 needs human approval (payment sandbox)", "warn"], ["Test data is synthetic", "ok"],
]

/** Regression suite: [test, suite, origin, failed-in-history?, warn-run-index, last status] */
export type RegressionRow = { test: string; suite: string; origin: string; failRuns: number[]; warnRun?: number; last: "passed" | "failed" | "warn"; fixedBy?: string }
export const REGRESSION: RegressionRow[] = [
  { test: "CHECKOUT-014 · one order per click", suite: "Playwright", origin: "From DEF-142", failRuns: [12, 19], last: "failed", fixedBy: "DEF-142" },
  { test: "ORDERS-API-003 · idempotent create", suite: "pytest", origin: "From DEF-133", failRuns: [], last: "passed" },
  { test: "AUTH-RATE-002 · login rate limit", suite: "pytest", origin: "From DEF-130", failRuns: [], warnRun: 4, last: "passed" },
  { test: "CART-009 · badge after remove", suite: "Playwright", origin: "Planner", failRuns: [], warnRun: 15, last: "warn" },
  { test: "SEC-012 · CSRF on email change", suite: "ZAP", origin: "From DEF-141", failRuns: [12, 19], last: "failed" },
  { test: "PAGINATION-004 · last page bound", suite: "Vitest", origin: "From DEF-136", failRuns: [], last: "passed" },
  { test: "PERF-CART-001 · p95 under 800 ms", suite: "k6", origin: "Planner", failRuns: [12, 19], warnRun: 10, last: "failed" },
]
export const REGRESSION_KPIS: [string, string, string, string][] = [
  ["Reusable tests", "212", "+14 promoted this sprint", "det"], ["Last full run", "98.6%", "209 / 212 passed", "ok"],
  ["Flaky tests", "3", "Quarantined, still reported", "warn"], ["Fixes verified", "11", "This sprint", "ai"],
]
