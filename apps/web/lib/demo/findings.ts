// Finding detail evidence, ported from trevyn-app/src/pages/Board.jsx (+ HAR from Network.jsx).
// Only DEF-142 has captured evidence in the demo; other findings show it labelled as sample evidence.
import type { LogKind } from "../types"

export type HarRow = { m: string; u: string; st: number; start: number; ph: Partial<Record<"dns" | "conn" | "tls" | "wait" | "recv", number>>; flag?: string }
export const HAR: HarRow[] = [
  { m: "GET", u: "/checkout", st: 200, start: 0, ph: { dns: 12, conn: 24, tls: 31, wait: 88, recv: 40 } },
  { m: "GET", u: "/_next/static/app.js", st: 200, start: 60, ph: { wait: 40, recv: 120 } },
  { m: "GET", u: "/api/cart", st: 200, start: 210, ph: { wait: 96, recv: 12 } },
  { m: "POST", u: "/api/orders", st: 201, start: 610, ph: { wait: 210, recv: 13 } },
  { m: "POST", u: "/api/orders", st: 201, start: 1060, ph: { wait: 418, recv: 13 }, flag: "duplicate retry" },
  { m: "GET", u: "/api/orders?page=1", st: 200, start: 1500, ph: { wait: 80, recv: 8 } },
]

export type FindingEvidence = {
  summary: string
  details: [string, string][]
  steps: string[]
  orders: { id: string; status: string; item: string; at: string; amount: string; dup?: boolean }[]
  ordersNote: string
  timeline: [string, string, LogKind][]
  console: string[]
  consoleError: string
  networkNote: string
  expected: string
  observed: string
  checks: [string, "ok" | "warn"][]
  uncertainty: string
  history: [LogKind, string, string][]
  objection: string
  propagation: { nodes: FlowNodeData[]; edges: FlowEdgeData[] }
}

// shared with the FlowMap chart
export type Tone = "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"
export type FlowNodeData = { id: string; label: string; sub: string; x: number; y: number; k?: Tone }
export type FlowEdgeData = { from: string; to: string; k?: Tone; l?: string; w?: number; s?: number }

export const DEF_142: FindingEvidence = {
  summary: "A single checkout action produced two orders. Trevyn reproduced the failure 3 of 3 times on Chromium and WebKit with a controlled 450 ms network delay. The same steps never create a duplicate when the client retry is disabled.",
  details: [["Component", "Checkout · Orders"], ["Environment", "Staging · DEMO"], ["Build", "a91f3c2"], ["Test case", "CHECKOUT-014"], ["First observed", "14 Oct 2026, 10:24"], ["Reproduced", "3 / 3 runs"], ["Browsers", "Chromium, WebKit"]],
  steps: ["Log in as qa-shopper-01", "Add Everyday Backpack to cart", "Throttle network to 450 ms latency", "Click \"Place order\" once", "Open Account → Order history"],
  orders: [
    { id: "SF-1042", status: "Confirmed", item: "Everyday Backpack × 1", at: "14 Oct 10:24:31", amount: "$79.00", dup: true },
    { id: "SF-1043", status: "Confirmed", item: "Everyday Backpack × 1", at: "14 Oct 10:24:32", amount: "$79.00", dup: true },
    { id: "SF-0998", status: "Delivered", item: "Trail Bottle × 2", at: "2 Oct", amount: "$36.00" },
  ],
  ordersNote: "Two orders created 0.9 s apart for one checkout click",
  timeline: [["00:00.000", "Open checkout", "det"], ["00:02.410", "Click \"Place order\"", "det"], ["00:02.633", "POST /api/orders → 201", "det"], ["00:03.120", "Network retry fired by client", "bad"], ["00:03.551", "POST /api/orders → 201 (duplicate)", "bad"], ["00:04.010", "Order history shows 2 orders", "bad"]],
  console: ["[10:24:31.402] info  checkout: submit clicked", "[10:24:31.625] info  orders: created SF-1042", "[10:24:32.112] warn  fetch: timeout 450ms, retrying POST /api/orders", "[10:24:32.543] info  orders: created SF-1043"],
  consoleError: "[10:24:32.544] error dbdiff: orders table +2 rows, expected +1",
  networkNote: "Both POST /api/orders requests were sent without an Idempotency-Key header.",
  expected: "1 order",
  observed: "2 orders",
  checks: [["Test preconditions validated", "ok"], ["Failure reproduced 3/3", "ok"], ["Network evidence captured", "ok"], ["Competing explanation ruled out: double click", "ok"], ["Root cause in payment provider not yet excluded", "warn"]],
  uncertainty: "Explicit uncertainty: Trevyn has not checked whether the provider also double-charges. A human should confirm before release.",
  history: [["ai", "v1 · Original confirmed report", "10:58"], ["det", "Evidence re-verified on rerun", "11:02"], ["ai", "v2 · Severity raised to High", "11:03"]],
  objection: "Could this be a double click from the test runner rather than a client retry?",
  propagation: {
    nodes: [{ id: "c", x: 90, y: 70, label: "Client retry", sub: "timeout 450ms", k: "warn" }, { id: "a", x: 270, y: 70, label: "POST /api/orders", sub: "201 × 2", k: "bad" }, { id: "s", x: 450, y: 70, label: "orders-svc", sub: "no dedupe", k: "bad" }, { id: "t", x: 620, y: 70, label: "orders table", sub: "+2 rows", k: "bad" }],
    edges: [{ from: "c", to: "a", k: "warn", l: "retry" }, { from: "a", to: "s", k: "bad" }, { from: "s", to: "t", k: "bad", l: "dup insert" }],
  },
}
