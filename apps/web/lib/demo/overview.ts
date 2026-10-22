// Overview (Quality dashboard) demo series.
import type { DashboardSummary, RunHealthPoint, ThroughputPoint, WeekSlot } from "../types"
import { APPROVALS, DAY, DEMO_TODAY, iso, seeded } from "./core"

function runHealth(): RunHealthPoint[] {
  const r = seeded(7)
  return Array.from({ length: 30 }, (_, i) => {
    const total = Math.round(78 + r() * 52 + (i % 7 === 5 || i % 7 === 6 ? -34 : 0))
    const failed = Math.max(2, Math.round(total * (0.05 + r() * 0.07) - i * 0.06))
    return { date: iso(DEMO_TODAY - (29 - i) * DAY), passed: total - failed, failed, runs: Math.round(4 + r() * 7) }
  })
}

function throughput(): ThroughputPoint[] {
  const r = seeded(19)
  const pts = Array.from({ length: 30 }, (_, i) => ({ date: iso(DEMO_TODAY - (29 - i) * DAY), evidence: Math.round(40 + r() * 150 + (r() > 0.8 ? 120 : 0)) }))
  pts[18].evidence = 412 // Oct 10: full cross-browser + ZAP sweep
  return pts
}

const WEEK: WeekSlot[] = [
  ["Thu", 6, 1], ["Fri", 9, 2], ["Sat", 4, 1], ["Sun", 2, 0], ["Mon", 7, 1], ["Tue", 11, 3], ["Wed", 5, 2],
].map(([day, verified, inconclusive], i) => ({
  day: day as string, verified: verified as number, inconclusive: inconclusive as number,
  date: iso(DEMO_TODAY - (6 - i) * DAY), today: i === 6,
}))

export const SUMMARY: DashboardSummary = {
  kpis: [
    { key: "tests_executed", label: "Tests executed", value: 128, delta: 18.2, deltaUnit: "%", goodDirection: "up", href: "/runs" },
    { key: "pass_rate", label: "Pass rate", value: 91.4, unit: "%", delta: 1.2, deltaUnit: "pts", goodDirection: "up", href: "/analytics" },
    { key: "confirmed_findings", label: "Confirmed findings", value: 6, delta: -25, deltaUnit: "%", goodDirection: "down", href: "/findings" },
    { key: "regressions_prevented", label: "Regressions prevented", value: 4, delta: 33.3, deltaUnit: "%", goodDirection: "up", href: "/regression" },
    { key: "pending_approvals", label: "Pending approvals", value: APPROVALS.length, delta: 25, deltaUnit: "%", goodDirection: "down", href: "/approvals" },
  ],
  runHealth: runHealth(),
  categories: [
    { type: "ui", label: "UI & browser", count: 11, high: 3 },
    { type: "api", label: "API & integration", count: 5, high: 1 },
    { type: "perf", label: "Performance", count: 4, high: 0 },
    { type: "security", label: "Security", count: 3, high: 2 },
    { type: "compat", label: "Compatibility", count: 3, high: 0 },
  ],
  topSuites: [
    { suite: "Checkout", icon: "cart", failures: 11, share: 42, tone: "bad" },
    { suite: "Authentication", icon: "key", failures: 6, share: 23, tone: "perf" },
    { suite: "Catalog", icon: "grid", failures: 5, share: 19, tone: "ai" },
    { suite: "Payments", icon: "card", failures: 4, share: 16, tone: "ui" },
  ],
  gate: { passRate: 91.4, gate: 90, passed: 117, failed: 11, release: "2.14.0", weekDelta: 1.2 },
  throughput: throughput(),
  week: WEEK,
  loop: { plan: [16, 18], prove: [3, 4], decide: [2, 2 + APPROVALS.length] },
}
