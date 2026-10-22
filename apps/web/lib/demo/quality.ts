// Quality-engineering demo data, ported from trevyn-app/src/pages/Quality.jsx (colour tokens translated).
import type { FlowEdgeData, FlowNodeData } from "./findings"

/* ---- Browser & UI ---- */
export const BROWSERS: [string, string, number][] = [["Chromium", "Desktop", 46], ["Firefox", "Desktop", 45], ["WebKit", "Desktop", 44], ["Chrome", "Pixel 8", 43], ["Safari", "iPhone 15", 42]]
export const FRAMES = ["goto /", "click Add to cart", "goto /checkout", "click Place order", "retry POST", "goto /orders"]
export const ACTIONS: [string, string][] = [["page.goto(\"/\")", "312 ms"], ["click getByRole(\"button\",{name:\"Add to cart\"})", "84 ms"], ["page.goto(\"/checkout\")", "401 ms"], ["click getByRole(\"button\",{name:\"Place order\"})", "2.41 s"], ["expect(orders).toHaveCount(1)", "failed"]]
export const RESOURCES: [string, string, string][] = [["doc", "Document", "var(--navy)"], ["js", "Script", "var(--brand)"], ["css", "Stylesheet", "color-mix(in srgb, var(--brand) 40%, white)"], ["img", "Image", "color-mix(in srgb, var(--muted-foreground) 40%, white)"], ["xhr", "XHR / fetch", "var(--det)"]]
export const PAGE_WEIGHT: [string, number[], string][] = [
  ["Chromium", [38, 612, 84, 880, 46], "41 requests"], ["Firefox", [38, 618, 84, 880, 46], "41 requests"], ["WebKit", [39, 640, 86, 902, 92], "43 requests · 2× orders"],
  ["Chrome · Pixel 8", [36, 612, 84, 410, 46], "39 requests"], ["Safari · iPhone 15", [37, 640, 86, 1240, 92], "44 requests · 2× orders"],
]
export const LCP: [string, number, "ok" | "warn" | "bad"][] = [["Chromium", 1480, "ok"], ["Firefox", 1590, "ok"], ["WebKit", 1640, "ok"], ["Chrome · Pixel 8", 2140, "warn"], ["Safari · iPhone 15", 2910, "bad"]]

/* ---- API ---- */
const trend = (b: number, s: number, n = 14) => Array.from({ length: n }, (_, i) => Math.round(b + s * i + ((i * 7919) % 13) * b * 0.02))
export type Check = "ok" | "warn" | "bad"
export const ENDPOINTS: { m: string; path: string; contract: Check; auth: Check; rules: Check; p50: number; p95: number; trend: number[] }[] = [
  { m: "POST", path: "/api/orders", contract: "ok", auth: "ok", rules: "bad", p50: 212, p95: 431, trend: trend(280, 11) },
  { m: "GET", path: "/api/orders", contract: "ok", auth: "ok", rules: "ok", p50: 61, p95: 140, trend: trend(138, 0) },
  { m: "POST", path: "/api/cart/items", contract: "ok", auth: "ok", rules: "ok", p50: 48, p95: 120, trend: trend(104, 1.2) },
  { m: "POST", path: "/api/coupons/apply", contract: "ok", auth: "ok", rules: "bad", p50: 72, p95: 180, trend: trend(176, 0) },
  { m: "POST", path: "/auth/token", contract: "ok", auth: "bad", rules: "ok", p50: 95, p95: 260, trend: trend(250, 0.6) },
  { m: "PUT", path: "/account/email", contract: "ok", auth: "warn", rules: "ok", p50: 80, p95: 210, trend: trend(205, 0) },
  { m: "GET", path: "/api/products", contract: "ok", auth: "ok", rules: "ok", p50: 38, p95: 96, trend: trend(98, -0.3) },
]
export const API_NODES: FlowNodeData[] = [
  { id: "cli", label: "Trevyn API runner", sub: "schemathesis · 212 checks", x: 100, y: 210, k: "ai" },
  { id: "gw", label: "API gateway", sub: "JWT · 96 req/s", x: 310, y: 210, k: "det" },
  { id: "e1", label: "POST /api/orders", sub: "DEF-142 · dup order", x: 540, y: 45, k: "bad" },
  { id: "e2", label: "GET /api/products", sub: "p95 96 ms", x: 540, y: 111, k: "det" },
  { id: "e3", label: "POST /api/cart/items", sub: "p95 120 ms", x: 540, y: 177, k: "det" },
  { id: "e4", label: "/api/coupons/apply", sub: "POST · stacking allowed", x: 540, y: 243, k: "bad" },
  { id: "e5", label: "POST /auth/token", sub: "no 429 after 50 tries", x: 540, y: 309, k: "bad" },
  { id: "e6", label: "PUT /account/email", sub: "CSRF token missing", x: 540, y: 375, k: "warn" },
  { id: "orders", label: "orders-svc", sub: "no idempotency key", x: 790, y: 45, k: "bad" },
  { id: "catalog", label: "catalog-svc", sub: "read replica", x: 790, y: 125, k: "det" },
  { id: "cart", label: "cart-svc", sub: "N+1 · p95 1.8 s", x: 790, y: 210, k: "warn" },
  { id: "auth", label: "auth-svc", sub: "JWT issue · verify", x: 790, y: 295, k: "det" },
  { id: "acct", label: "account-svc", sub: "session cookie", x: 790, y: 375, k: "det" },
  { id: "pg", label: "PostgreSQL", sub: "orders · order_items", x: 1000, y: 110, k: "det" },
  { id: "redis", label: "Redis", sub: "sessions · cart cache", x: 1000, y: 320, k: "det" },
]
export const API_EDGES: FlowEdgeData[] = [
  { from: "cli", to: "gw", k: "ai", l: "96 req/s", w: 3, s: 1.5 },
  { from: "gw", to: "e1", k: "bad", l: "2× POST", s: 1.4 }, { from: "gw", to: "e2", k: "det" }, { from: "gw", to: "e3", k: "det" },
  { from: "gw", to: "e4", k: "bad", s: 1.6 }, { from: "gw", to: "e5", k: "bad", s: 1.2 }, { from: "gw", to: "e6", k: "warn" },
  { from: "e1", to: "orders", k: "bad", l: "201 ×2", s: 1.6 }, { from: "e2", to: "catalog", k: "det" }, { from: "e3", to: "cart", k: "det" },
  { from: "e4", to: "cart", k: "bad", l: "200 ≠ 422" }, { from: "e5", to: "auth", k: "bad", l: "200 ≠ 429" }, { from: "e6", to: "acct", k: "warn" },
  { from: "orders", to: "pg", k: "bad", s: 1.8 }, { from: "catalog", to: "pg", k: "det" }, { from: "cart", to: "pg", k: "warn", l: "37 q/req", s: 1.1 },
  { from: "cart", to: "redis", k: "det" }, { from: "auth", to: "redis", k: "det" }, { from: "acct", to: "redis", k: "det" },
]
const SEC = Array.from({ length: 15 }, (_, i) => `${i}:00`)
export const API_STATUS = {
  labels: SEC,
  series: [
    { k: "200 OK", c: "var(--det)", vals: SEC.map((_, i) => 52 + ((i * 5) % 9) + (i > 3 && i < 9 ? 10 : 0)) },
    { k: "201 Created", c: "var(--brand)", vals: SEC.map((_, i) => 14 + ((i * 3) % 5) + (i >= 6 && i <= 8 ? 6 : 0)) },
    { k: "4xx", c: "var(--warn)", vals: SEC.map((_, i) => (i >= 9 && i <= 11 ? 18 : 6) + (i % 3)) },
    { k: "5xx", c: "var(--bad)", vals: SEC.map((_, i) => (i === 7 ? 4 : i === 12 ? 3 : 0)) },
  ],
}
export const API_KPIS: [string, string, string, string][] = [["Endpoints covered", "34 / 37", "92% of schema", "det"], ["Contract checks", "212", "All schemas valid", "ok"], ["Auth checks", "48", "1 failure", "bad"], ["Median latency", "84 ms", "p95 312 ms", "det"]]

/* ---- Performance ---- */
export const P95 = [180, 210, 260, 330, 420, 520, 690, 810, 1320, 1610, 1790, 1810]
export const VUS = [10, 20, 35, 55, 80, 105, 135, 175, 190, 200, 200, 200]
export const MINUTES = P95.map((_, i) => `${i + 1}m`)
export const BUCKETS = ["≥ 2 s", "1.2 – 2 s", "800 ms – 1.2 s", "400 – 800 ms", "200 – 400 ms", "100 – 200 ms", "< 100 ms"]
export const LATENCY_HEAT = (() => {
  const cols = P95.map((_, i) => { const c = 0.5 + i * 0.44, w = [0, 1, 2, 3, 4, 5, 6].map((b) => Math.exp(-((b - c) ** 2) / 1.7)), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s) })
  return BUCKETS.map((_, ri) => cols.map((col) => col[6 - ri]))
})()
export const PERF_STRIP: [string, string, string?, string?][] = [["Peak VUs", "200"], ["HTTP requests", "148,210"], ["Throughput", "206 req/s"], ["Failed requests", "0.4%", undefined, "ok"], ["p95 at peak", "1 810 ms", undefined, "bad"]]
export const THRESHOLDS: [string, string, "ok" | "bad"][] = [["http_req_duration p(95) < 800 ms", "1 810 ms", "bad"], ["http_req_failed rate < 1%", "0.4%", "ok"], ["checks rate > 99%", "99.6%", "ok"], ["iteration_duration p(90) < 2 s", "2.4 s", "bad"]]
export const ERROR_RATE = { vals: [0, 0, 0.02, 0.04, 0.07, 0.1, 0.16, 0.3, 0.75, 1.3], labels: ["20", "40", "60", "80", "100", "120", "140", "160", "180", "200 VUs"] }

/* ---- Security ---- */
export const ATTACK_NODES: FlowNodeData[] = [
  { id: "login", label: "Login", sub: "POST /auth/token", x: 120, y: 70, k: "acc" },
  { id: "email", label: "Account email", sub: "PUT /account/email", x: 120, y: 160, k: "acc" },
  { id: "search", label: "Product search", sub: "GET /search?q=", x: 120, y: 230, k: "acc" },
  { id: "hooks", label: "Payment webhooks", sub: "POST /webhooks/stripe", x: 120, y: 300, k: "acc" },
  { id: "pages", label: "All pages", sub: "response headers", x: 120, y: 370, k: "acc" },
  { id: "a02", label: "A02 Crypto failures", sub: "jwt none-alg · fixed", x: 450, y: 40, k: "det" },
  { id: "a07", label: "A07 Auth failures", sub: "no rate limit", x: 450, y: 105, k: "warn" },
  { id: "a01", label: "A01 Access control", sub: "CSRF token missing", x: 450, y: 170, k: "bad" },
  { id: "a03", label: "A03 Injection", sub: "raw SQL · search.py:88", x: 450, y: 235, k: "bad" },
  { id: "a08", label: "A08 Integrity", sub: "signature verified", x: 450, y: 300, k: "det" },
  { id: "a05", label: "A05 Misconfiguration", sub: "CSP · SameSite", x: 450, y: 370, k: "warn" },
  { id: "users", label: "users table", sub: "email · pw hash", x: 790, y: 120, k: "bad" },
  { id: "odb", label: "orders DB", sub: "orders · payments", x: 790, y: 240, k: "warn" },
  { id: "sess", label: "Session store", sub: "Redis · JWT", x: 790, y: 350, k: "mut" },
]
export const ATTACK_EDGES: FlowEdgeData[] = [
  { from: "login", to: "a02", k: "det", s: 3 }, { from: "login", to: "a07", k: "warn", l: "50 tries · no 429" }, { from: "email", to: "a01", k: "bad", l: "cross-site PUT", s: 1.3, w: 2.4 },
  { from: "search", to: "a03", k: "bad", l: "q=' OR 1=1", s: 1.2, w: 2.4 }, { from: "hooks", to: "a08", k: "det", s: 3 }, { from: "pages", to: "a05", k: "warn" },
  { from: "a07", to: "users", k: "warn" }, { from: "a01", to: "users", k: "bad", l: "account takeover", s: 1.4, w: 2.4 }, { from: "a03", to: "users", k: "bad", s: 1.5 },
  { from: "a03", to: "odb", k: "bad", l: "read all orders", s: 1.5, w: 2.4 }, { from: "a08", to: "odb", k: "det", s: 3 }, { from: "a02", to: "sess", k: "det", s: 3 }, { from: "a05", to: "sess", k: "warn" },
]
export const SECURITY_KPIS: [string, string, string, string][] = [["High", "2", "CSRF, SQL injection risk", "bad"], ["Medium", "3", "Rate limit, headers", "warn"], ["Low", "7", "Informational", "mut"], ["Suppressed", "4", "With written justification", "det"]]
export const OWASP_ROWS: [string, number[], string][] = [["A01 Access control", [1, 0, 1], "CSRF on /account/email"], ["A03 Injection", [1, 0, 2], "search.py:88"], ["A05 Misconfiguration", [0, 1, 3], "CSP, SameSite, X-Frame"], ["A07 Auth failures", [0, 1, 1], "/auth/token"], ["A02 Crypto failures", [0, 1, 0], "fixed · verifying"]]
export const SEC_FINDINGS: [string, string, string, string, "high" | "medium" | "low", string][] = [
  ["ZAP", "CSRF token missing", "A01 Broken access control", "PUT /account/email", "high", "Repair proposed"], ["Semgrep", "python.sqlalchemy.raw-sql", "A03 Injection", "search.py:88", "high", "Investigating"],
  ["ZAP", "No rate limit on auth", "A07 Auth failures", "/auth/token", "medium", "Regression"], ["ZAP", "CSP header missing", "A05 Misconfiguration", "All pages", "medium", "Triage"],
  ["Semgrep", "jwt-none-alg-allowed", "A02 Crypto failures", "auth/jwt.py:21", "medium", "Fixed"], ["ZAP", "Cookie without SameSite", "A05 Misconfiguration", "session cookie", "low", "Triage"],
]

/* ---- Compatibility ---- */
export type Cell = "ok" | "warn" | "bad" | "na"
export const COMPAT_BROWSERS = ["Chrome", "Firefox", "Safari", "Edge"]
export const MATRIX: [string, ...Cell[]][] = [["Windows 11", "ok", "ok", "na", "ok"], ["macOS 15", "ok", "ok", "warn", "ok"], ["Ubuntu 24.04", "ok", "ok", "na", "ok"], ["Android 15", "ok", "warn", "na", "na"], ["iOS 18", "ok", "na", "bad", "na"]]
export const OS_PASS: [string, number, "ok" | "warn" | "bad"][] = [["Windows 11", 99.3, "ok"], ["Ubuntu 24.04", 99.1, "ok"], ["macOS 15", 96.8, "warn"], ["Android 15", 94.6, "warn"], ["iOS 18", 88.0, "bad"]]
