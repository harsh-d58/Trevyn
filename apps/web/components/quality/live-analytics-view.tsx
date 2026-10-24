"use client"
// Analytics from GET /api/insights/analytics (ANALYTICS.md M6). Same cards as the demo view; every number is
// measured, and a card with nothing measured yet says what will fill it.
import { motion } from "motion/react"
import { useState } from "react"
import { WeekHourHeatmap } from "@/components/charts/bars"
import { FlowMap, type FlowEdgeData, type FlowNodeData } from "@/components/charts/flow-map"
import { Sankey, TrendLine, type SankeyNode } from "@/components/charts/flow-charts"
import { Card, StagePanel } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { HBars, type MeterTone } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Empty } from "@/components/kit/page-loading"
import { Pill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import type { LiveAnalytics } from "@/lib/live-data"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const TYPE_TONE: Record<string, MeterTone> = { ui: "brand", api: "det", security: "bad", perf: "warn", network: "warn", compat: "ai" }
const KIND_LABEL: Record<string, string> = {
  trace: "Playwright trace", network: "Network log", console: "Console log", screenshot: "Screenshot",
  screenshot_failure: "Failure screenshot", passive_check: "Header / cookie check",
}
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

function flowChart(f: LiveAnalytics["flow"]) {
  const uncertain = f.needs_review + f.inconclusive, repaired = Math.min(f.repaired, f.confirmed), verified = Math.min(f.verified, repaired)
  const cols: SankeyNode[][] = [
    [{ id: "det", label: "Detected", v: f.detected, c: "var(--brand)" }],
    [{ id: "conf", label: "Confirmed", v: f.confirmed, c: "var(--bad)" }, { id: "unc", label: "Uncertain", v: uncertain, c: "var(--warn)" }],
    [{ id: "rep", label: "Repaired", v: repaired, c: "var(--ai)" }, { id: "open", label: "Still open", v: f.confirmed - repaired, c: "var(--muted-foreground)" },
      { id: "rev", label: "Needs a person", v: uncertain, c: "var(--human)" }],
    [{ id: "ver", label: "Verified", v: verified, c: "var(--ok)" }, { id: "rer", label: "Awaiting rerun", v: repaired - verified, c: "var(--det)" }],
  ].map((col) => col.filter((n) => n.v > 0)).filter((col) => col.length)
  const links = ([["det", "conf", f.confirmed], ["det", "unc", uncertain], ["conf", "rep", repaired], ["conf", "open", f.confirmed - repaired],
    ["unc", "rev", uncertain], ["rep", "ver", verified], ["rep", "rer", repaired - verified]] as [string, string, number][])
    .filter(([, , v]) => v > 0).map(([s, t, v]) => ({ s, t, v }))
  return { cols, links, uncertain }
}

function evidenceGraph(e: LiveAnalytics["evidence"]) {
  const kinds = Object.keys(e.kinds)
  const nodes: FlowNodeData[] = [
    ...e.findings.map((f, i) => ({ id: f.id, label: f.id, sub: f.title.slice(0, 26), k: f.status === "confirmed" ? "bad" as const : "warn" as const, x: 120, y: 48 + i * 72 })),
    ...kinds.map((k, i) => ({ id: k, label: KIND_LABEL[k] ?? k, sub: `${e.kinds[k]} files`, k: "det" as const, x: 780, y: 48 + i * 72 })),
  ]
  const edges: FlowEdgeData[] = e.findings.flatMap((f) => Object.entries(f.kinds).filter(([k]) => kinds.includes(k))
    .map(([k, n]) => ({ from: f.id, to: k, k: f.status === "confirmed" ? "det" as const : "warn" as const, l: n > 1 ? `${n}` : undefined, s: 2.2 })))
  return { nodes, edges, h: 48 + Math.max(e.findings.length, kinds.length, 1) * 72 }
}

export function LiveAnalyticsView({ data }: { data: LiveAnalytics }) {
  const { flow, evidence } = data
  const sankey = flowChart(flow)
  const graph = evidenceGraph(evidence)
  const [sel, setSel] = useState(evidence.findings[0]?.id ?? "")
  const linked = graph.edges.filter((e) => e.from === sel || e.to === sel).map((e) => (e.from === sel ? e.to : e.from))
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id
  const pass = data.passRate30.filter((d): d is { date: string; rate: number } => d.rate !== null)
  const lastMttr = data.mttr.at(-1)
  const heat = WEEKDAYS.map((_, d) => Array.from({ length: 24 }, (_, h) => data.heatmap.find((c) => c.weekday === d && c.hour === h)?.count ?? 0))
  const peak = data.heatmap.reduce<LiveAnalytics["heatmap"][number] | null>((m, c) => (!m || c.count > m.count ? c : m), null)
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Intelligence" title="Analytics" sub="Quality trends across all projects, measured from runs, findings and repairs." />
      <StatStrip items={[
        ["Mean time to resolve", lastMttr ? `${lastMttr.mttrHours} h` : "—", lastMttr ? `${lastMttr.count} verified this week` : "No verified repairs yet", "ok"],
        ["Flaky tests", data.flaky.length, "Mixed outcomes in their last 10 runs", data.flaky.length ? "warn" : "ok"],
        ["AI diagnoses", `${data.diagnoses.ai} / ${data.diagnoses.total}`, data.diagnoses.ai < data.diagnoses.total ? "The rest used rules (no working AI key)" : "All diagnoses by the model", "ai"],
        ["Model cost", `$${data.totalCostUsd.toFixed(2)}`, `${data.policyDenials} policy denials`, "det"],
      ]} />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title={`Finding flow · ${flow.detected} findings`} extra={<span className="text-[11px] text-muted-foreground tabular">{flow.verified} / {flow.detected} verified fixed</span>}>
          {flow.detected ? <Sankey cols={sankey.cols} links={sankey.links} />
            : <Empty what="No findings yet" why="Findings appear after a run verifies its test cases." />}
          <p className="mt-2 text-[12px] text-muted-foreground">Every finding is proven by execution or marked uncertain for a person. Only repairs that pass regression count as verified.</p>
        </Card>
        <Card title="Findings by type">
          {data.byType.length ? <HBars rows={data.byType.map((t) => [t.label, t.count, TYPE_TONE[t.type] ?? "brand"])} />
            : <Empty what="Nothing to group yet" why="Run a test to see findings by type." />}
          <div className="glass-inset mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl text-center">
            {([[flow.confirmed, "Confirmed", "text-bad"], [sankey.uncertain, "Uncertain", "text-warn"], [flow.verified, "Verified fixed", "text-ok"]] as const).map(([v, l, c]) => (
              <div key={l} className="bg-white/40 px-2 py-2.5"><div className={`text-[24px] font-light tabular ${c}`}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Pass rate · 30 days" extra={<span className="text-[11px] text-muted-foreground">{pass.length} day{pass.length === 1 ? "" : "s"} with runs</span>}>
          {pass.length >= 2 ? <TrendLine vals={pass.map((d) => d.rate)} labels={pass.map((d) => day(d.date))} min={0} max={100} step={25} unit="%" name="Pass rate %" />
            : <Empty what={pass.length ? `${pass[0].rate}% on ${day(pass[0].date)}` : "No runs in the last 30 days"} why="The trend line needs runs on at least two days." />}
        </Card>
        <Card title="Mean time to resolve · weekly" extra={lastMttr && <Pill tone="ok">{lastMttr.mttrHours} h this week</Pill>}>
          {data.mttr.length >= 2 ? <TrendLine vals={data.mttr.map((m) => m.mttrHours)} labels={data.mttr.map((m) => m.week.slice(5))} min={0}
            max={Math.ceil(Math.max(...data.mttr.map((m) => m.mttrHours), 4))} step={1} unit=" h" thr={4} thrL="Target 4 h" color="var(--det)" name="MTTR h" />
            : <Empty what={lastMttr ? `${lastMttr.mttrHours} h in ${lastMttr.week}` : "No verified repairs yet"} why="Time from a confirmed finding to a repair that passed regression." />}
        </Card>
      </div>
      <StagePanel eyebrow="Finding → evidence network" title="No claim without an artifact behind it"
        aside={
          <div className="flex flex-wrap gap-px overflow-hidden rounded-xl bg-white/50 text-center">
            {[[evidence.backed, "Backed by execution", "#5cc8b2"], [evidence.uncertain, "Marked uncertain", "#e9c46a"]].map(([v, l, c]) => (
              <div key={l} className="bg-white/60 px-4 py-2"><div className="text-[24px] font-light tabular" style={{ color: String(c) }}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        }
        footer={sel ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/70 px-4 py-3 text-[12.5px]">
            <span className="font-mono text-brand">{name(sel)}</span>
            <motion.span key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-foreground/80">linked to {linked.map(name).join(", ") || "nothing yet"}</motion.span>
            <span className="ml-auto text-[11px] text-muted-foreground">Click a node · newest {evidence.findings.length} confirmed or uncertain findings</span>
          </div>
        ) : undefined}>
        {evidence.findings.length ? <FlowMap pastel nodes={graph.nodes} edges={graph.edges} w={900} h={graph.h} nw={178} sel={sel} onSelect={setSel} label="Finding to evidence network" />
          : <Empty what="No evidence-backed findings yet" why="Each confirmed finding links to the screenshots, traces and logs that prove it." />}
      </StagePanel>
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="When findings appear · weekday × hour (UTC)" extra={peak && <span className="text-[11px] text-muted-foreground">Peak: {WEEKDAYS[peak.weekday]} {String(peak.hour).padStart(2, "0")}:00</span>}>
          <WeekHourHeatmap rows={WEEKDAYS} data={heat} />
        </Card>
        <Card flush title="Most flaky tests">
          {data.flaky.length ? <DataTable head={["Test", "Flake rate", "Last 10 runs"]}>
            {data.flaky.map((r) => <Row key={r.case}><Cell className="font-mono text-[11.5px]">{r.case}</Cell><Cell className="tabular">{r.rate}%</Cell><Cell className="text-muted-foreground">{r.passed} passed · {r.failed} failed</Cell></Row>)}
          </DataTable> : <Empty what="No flaky tests" why="A test is flaky when it both passes and fails across its last 10 runs." />}
        </Card>
      </div>
    </div>
  )
}
