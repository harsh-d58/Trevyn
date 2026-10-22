// Network, Analytics, Planner and Admin demo data, ported from trevyn-app Network.jsx, Repair.jsx (Analytics),
// Plans.jsx (Planner) and Admin.jsx. Plus the live platform topology from the prototype Overview.
import type { SankeyNode } from "@/components/charts/flow-charts"
import type { FlowEdgeData, FlowNodeData } from "./findings"
import { lastDays } from "./core"

/* ---- Network & traces ---- */
export const NET_NODES: FlowNodeData[] = [
  { id: "browser", label: "Browser clients", sub: "3 engines · 46 tests", x: 100, y: 200, k: "acc" },
  { id: "cdn", label: "CDN edge", sub: "cache hit 91%", x: 290, y: 200, k: "det" },
  { id: "web", label: "Next.js web", sub: "SSR · 180 req/s", x: 480, y: 110, k: "det" },
  { id: "gw", label: "API gateway", sub: "232 req/s", x: 480, y: 290, k: "det" },
  { id: "orders", label: "orders-svc", sub: "DEF-142 · dup POST", x: 680, y: 50, k: "bad" },
  { id: "cart", label: "cart-svc", sub: "p95 1.8 s", x: 680, y: 150, k: "warn" },
  { id: "auth", label: "auth-svc", sub: "rate limit fixed", x: 680, y: 250, k: "det" },
  { id: "pay", label: "payments", sub: "sandbox only", x: 680, y: 350, k: "mut" },
  { id: "pg", label: "PostgreSQL", sub: "37 q/req on cart", x: 860, y: 110, k: "det" },
  { id: "redis", label: "Redis", sub: "sessions · cache", x: 860, y: 290, k: "det" },
]
export const NET_EDGES: FlowEdgeData[] = [
  { from: "browser", to: "cdn", k: "acc", l: "412 req/s", w: 3, s: 1.6 }, { from: "cdn", to: "web", k: "det", l: "180 req/s", w: 2.2 }, { from: "cdn", to: "gw", k: "det", l: "232 req/s", w: 2.6 },
  { from: "gw", to: "orders", k: "bad", l: "2× POST", s: 1.4 }, { from: "gw", to: "cart", k: "warn", l: "121 req/s", w: 2 }, { from: "gw", to: "auth", k: "det", l: "54 req/s" }, { from: "gw", to: "pay", k: "mut", l: "6 req/s", s: 3.4 },
  { from: "orders", to: "pg", k: "bad", s: 1.8 }, { from: "cart", to: "pg", k: "warn", l: "N+1", s: 1.2 }, { from: "cart", to: "redis", k: "det" }, { from: "auth", to: "redis", k: "det" },
]
export const NET_INFO: Record<string, [string, string, string, string]> = {
  browser: ["46", "—", "0%", "Playwright drives chromium, firefox and webkit through the checkout journey."],
  cdn: ["412", "18 ms", "0%", "Static assets cached at the edge. Images over 1 MB flagged on mobile (DEF-131, fixed)."],
  web: ["180", "140 ms", "0.1%", "Server-rendered pages. No failures in this run."],
  gw: ["232", "96 ms", "0.4%", "Routes API traffic. Retries are issued by the client, not the gateway."],
  orders: ["38", "431 ms", "2.6%", "Client retry after a 450 ms timeout creates a second order. No idempotency key."],
  cart: ["121", "1 810 ms", "0.3%", "Latency climbs past 175 VUs. 37 queries per request point to an N+1 in pricing."],
  auth: ["54", "95 ms", "0%", "Rate limit on /auth/token enforced since DEF-130 patch."],
  pay: ["6", "260 ms", "0%", "Sandbox only. Refund tests need human approval."],
  pg: ["640 q/s", "4 ms", "0%", "Connection pool at 71%. Hot table: order_items."],
  redis: ["310 op/s", "1 ms", "0%", "Session and cart cache. Hit ratio 88%."],
}
export const STATUS_CODES: [string, number, string][] = [["2xx", 96.1, "var(--det)"], ["3xx", 2.1, "var(--brand)"], ["4xx", 1.4, "var(--warn)"], ["5xx", 0.4, "var(--bad)"]]
export const TOP_ENDPOINTS: [string, string, number, number, boolean?][] = [["GET", "/api/cart", 121, 1810, true], ["POST", "/api/orders", 38, 431, true], ["GET", "/api/products", 96, 210], ["GET", "/checkout", 64, 188], ["POST", "/auth/token", 54, 95], ["GET", "/api/search", 41, 160]]
const MIN = Array.from({ length: 30 }, (_, i) => { const m = 40 + i; return m >= 60 ? `11:${String(m - 60).padStart(2, "0")}` : `10:${m}` })
const wave = (b: number, a: number, f: number, o = 0) => MIN.map((_, i) => Math.max(0, Math.round(b + a * Math.sin(i / f + o) + (i % 7 === 3 ? a / 2 : 0))))
export const NET_THROUGHPUT = {
  labels: MIN,
  series: [
    { k: "2xx", c: "var(--det)", vals: wave(380, 30, 3) },
    { k: "4xx", c: "var(--warn)", vals: wave(14, 6, 2, 1) },
    { k: "5xx", c: "var(--bad)", vals: MIN.map((_, i) => (i > 22 ? 18 + (i % 3) * 6 : i === 12 ? 9 : 1)) },
  ],
}
export const LATENCY_BUCKETS: [string, number, (0 | 1)?][] = [["50", 820], ["100", 1640], ["150", 2210], ["200", 1890], ["300", 1200], ["400", 640], ["600", 380], ["800", 210], ["1k", 120, 1], ["1.5k", 80, 1], ["2k", 46, 1], ["3k", 12, 1]]
export const NET_KPIS: [string, string, string, string][] = [["Requests captured", "18,420", "Across 46 tests", "det"], ["Error rate", "0.42%", "2 services degraded", "bad"], ["p95 latency", "312 ms", "cart-svc 1.8 s at peak", "warn"], ["Hosts contacted", "6", "All on the allowlist", "ok"]]

/* ---- Analytics ---- */
export const FLOW_COLS: SankeyNode[][] = [
  [{ id: "det", label: "Detected", v: 44, c: "var(--brand)" }],
  [{ id: "conf", label: "Confirmed", v: 31, c: "var(--bad)" }, { id: "inc", label: "Inconclusive", v: 8, c: "var(--warn)" }, { id: "ovr", label: "Overturned", v: 5, c: "var(--human)" }],
  [{ id: "rep", label: "Repaired", v: 26, c: "var(--ai)" }, { id: "open", label: "Still open", v: 7, c: "var(--muted-foreground)" }, { id: "dis", label: "Dismissed", v: 11, c: "#c4cbd8" }],
  [{ id: "ver", label: "Verified", v: 24, c: "var(--ok)" }, { id: "rer", label: "Awaiting rerun", v: 2, c: "var(--det)" }],
]
export const FLOW_LINKS = ([["det", "conf", 31], ["det", "inc", 8], ["det", "ovr", 5], ["conf", "rep", 24], ["conf", "open", 7], ["inc", "rep", 2], ["inc", "dis", 6], ["ovr", "dis", 5], ["rep", "ver", 24], ["rep", "rer", 2]] as [string, string, number][]).map(([s, t, v]) => ({ s, t, v }))
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
/* failed runs per weekday × hour, last 30 days: nightly suite at 02:00, Tue/Thu deploy windows */
export const WEEK_HEAT = WEEKDAYS.map((_, d) => Array.from({ length: 24 }, (_, h) => {
  let v = 0
  if (h === 2 || h === 3) v += d < 5 ? 3 : 1
  if (d < 5 && h >= 9 && h <= 18) v += 1
  if (d === 1 && h >= 14 && h <= 16) v += h === 15 ? 8 : 5
  if (d === 3 && h >= 15 && h <= 17) v += h === 16 ? 6 : 3
  if (d === 0 && h === 10) v += 3
  if ((d * 31 + h * 17) % 7 === 0 && v) v += 1
  return v
}))
export const EV_NODES: FlowNodeData[] = [
  ...([["DEF-142", "Duplicate orders · 92%", "bad"], ["DEF-141", "Missing CSRF · 88%", "bad"], ["DEF-135", "SQL from input · 90%", "bad"], ["DEF-139", "Cart p95 1.8 s · 74%", "warn"], ["DEF-137", "Safari autofill · 58%", "human"]] as const)
    .map(([id, sub, k], i) => ({ id, label: id, sub, k, x: 120, y: 48 + i * 72 })),
  ...([["trace", "Playwright trace", "61 traces", "det"], ["har", "HAR capture", "38 files", "det"], ["db", "DB diff", "12 snapshots", "det"], ["shot", "Screenshot", "94 images", "acc"], ["log", "Server log", "27 excerpts", "det"]] as const)
    .map(([id, label, sub, k], i) => ({ id, label, sub, k, x: 780, y: 48 + i * 72 })),
]
export const EV_EDGES: FlowEdgeData[] = ([["DEF-142", "trace", "det", "3/3 repro"], ["DEF-142", "har", "det", "431 ms apart"], ["DEF-142", "db", "det", "+2 rows"], ["DEF-142", "log", "det"], ["DEF-141", "har", "det"], ["DEF-141", "log", "det", "ZAP alert"], ["DEF-135", "log", "det"], ["DEF-135", "db", "det"],
  ["DEF-139", "trace", "warn"], ["DEF-139", "log", "warn", "k6 p95"], ["DEF-137", "shot", "human", "1 of 3 runs"], ["DEF-137", "trace", "human"]] as [string, string, FlowEdgeData["k"], string?][])
  .map(([from, to, k, l]) => ({ from, to, k, l, s: 2 + (from.charCodeAt(6) % 4) * 0.3 }))
export const ANALYTICS_KPIS: [string, string, string, string][] = [["Mean time to resolve", "3.2 h", "−41% vs September", "ok"], ["Flaky test rate", "1.8%", "Quarantined: 3", "warn"], ["AI diagnoses accepted", "78%", "14 challenged, 5 overturned", "ai"], ["Escaped defects", "0", "Since Trevyn pilot", "ok"]]
export const PASS_30 = { vals: [84, 85, 85.5, 84.8, 86, 86.4, 87, 86.2, 87.5, 88, 87.2, 88.4, 88.9, 88.1, 89, 89.4, 88.6, 90.1, 89.8, 90.4, 90.2, 91, 90.6, 91.3, 92, 91.5, 92.4, 90.9, 91.1, 91.4], labels: lastDays(30).map((d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })) }
export const MTTR = { vals: [6.1, 5.8, 6.0, 5.7, 5.5, 5.6, 5.2, 5.3, 4.6, 4.1, 3.6, 3.2], labels: ["W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39", "W40", "W41", "W42", "W43"] }
export const FLAKY: [string, string, string][] = [["CART-009", "12%", "Network stub timing"], ["SEARCH-031", "6%", "Index warm-up"], ["UI-PROFILE-07", "4%", "Animation wait"]]

/* ---- AI test planner ---- */
export const AUTONOMY = ["Only low-risk tests run automatically.", "Low and medium-risk tests run automatically. High-risk tests need approval.", "All tests run automatically. Payment and destructive tests still need approval by policy."]
export const AUTONOMY_LABEL = ["Auto-run: low only", "Auto-run: up to medium", "Auto-run: all except policy-gated"]
export const AUTONOMY_THR = [33.3, 66.7, 100]
export const GENERATED: [string, string, "low" | "medium" | "high"][] = [["GUEST-001", "Guest applies a valid coupon once", "low"], ["GUEST-002", "Expired coupon is rejected with a message", "low"], ["GUEST-003", "Same coupon twice in one order", "medium"], ["GUEST-004", "Slow network retry creates one order", "medium"], ["GUEST-005", "Coupon stacking with sale prices", "medium"], ["GUEST-006", "Refund of a discounted order in payment sandbox", "high"]]
export const RISK_POINTS: [string, number, number][] = [["GUEST-001", 12, 94], ["GUEST-002", 22, 91], ["GUEST-003", 46, 83], ["GUEST-004", 58, 77], ["GUEST-005", 52, 68], ["GUEST-006", 88, 72], ["CHECKOUT-014", 74, 92], ["PAY-007", 93, 64], ["CART-009", 28, 58]]
export const PLANNER_CONTEXT = ["URL: staging.shopflow.demo", "Repo: demo/shopflow", "openapi.yaml", "checkout_acceptance.md"]
export const PLANNER_REQUEST = "Verify that guest checkout with a coupon applies the discount once, rejects expired coupons, and never creates duplicate orders on slow networks."

/* ---- Administration ---- */
export const INTEGRATIONS: [string, string, string, boolean][] = [["GitHub Actions", "Trigger runs on every PR", "CI/CD", true], ["Playwright", "Browser automation and traces", "Test engine", true], ["k6", "Load and performance tests", "Test engine", true], ["OWASP ZAP", "Dynamic security scanning", "Test engine", true], ["Semgrep", "Static analysis rules", "Test engine", true], ["pytest · Vitest · JUnit", "Unit and API runners", "Test engine", true], ["PostgreSQL", "Run history and evidence index", "Data", true], ["Redis · Celery", "Job queue for test workers", "Data", true], ["Object storage", "Screenshots, traces, HAR files", "Data", true], ["Anthropic API", "Planning and diagnosis models", "AI model", true], ["OpenAI API", "Alternate model provider", "AI model", false], ["Slack", "Finding and approval alerts", "Notify", false], ["Jira", "Sync findings as issues", "Notify", false]]
export const ROLES = ["Owner", "QA Lead", "QA Engineer", "Developer", "Viewer"]
export const PERMS = ["Launch runs", "Approve patches", "Approve high-impact tests", "Edit policies", "View evidence"]
export const RBAC = [[1, 1, 1, 1, 1], [1, 1, 1, 0, 1], [1, 0, 0, 0, 1], [1, 1, 0, 0, 1], [0, 0, 0, 0, 1]]
export const ALLOWLIST = ["staging.shopflow.demo", "qa.shopflow.demo", "api.paygrid.test"]
export const SECRETS: [string, string][] = [["qa-shopper-01", "vault://demo/shopflow/qa-shopper"], ["stripe-sandbox", "vault://demo/payments/stripe-test"], ["github-token", "vault://ci/github/read-only"]]
export const PROVIDERS: [string, string, string][] = [["anthropic", "Anthropic API", "Claude models for planning and diagnosis"], ["openai", "OpenAI API", "Alternate provider"], ["agnostic", "Provider-agnostic routing", "Pick per task by quality, speed and cost"]]

/* ---- Trevyn platform topology (prototype Overview "RUN live" map), animated by the live store ---- */
export const PLATFORM_NODES: FlowNodeData[] = [
  { id: "dash", label: "QA dashboard", sub: "Next.js · live runs", x: 100, y: 60, k: "det" }, { id: "ci", label: "CI/CD trigger", sub: "GitHub Actions", x: 100, y: 180, k: "det" },
  { id: "dev", label: "Developer review", sub: "approve patches", x: 100, y: 300, k: "human" }, { id: "cp", label: "Control plane", sub: "FastAPI · Pydantic", x: 330, y: 120, k: "det" },
  { id: "q", label: "Redis · Celery", sub: "queue", x: 330, y: 250, k: "det" }, { id: "opa", label: "OPA policy gate", sub: "bundle v12", x: 570, y: 60, k: "det" },
  { id: "orch", label: "AI orchestrator", sub: "LangGraph", x: 830, y: 60, k: "ai" }, { id: "hum", label: "Human approval", sub: "approvals", x: 570, y: 180, k: "human" },
  { id: "w", label: "Test workers", sub: "Playwright · k6 · ZAP", x: 570, y: 305, k: "det" }, { id: "ev", label: "Evidence store", sub: "Postgres · objects", x: 830, y: 250, k: "det" },
]
export const LOOP_STAGES: [string, string][] = [["PLAN", "Reads requirements and code; builds the test plan."], ["PROBE", "Explores journeys; runs UI, API, perf and security tests."], ["PROVE", "Captures traces; reproduces every failure."], ["REPAIR & REGRESS", "Proposes fixes, then reruns regression."]]
