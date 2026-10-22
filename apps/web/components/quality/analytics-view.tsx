"use client"
// Analytics (from Repair.jsx Analytics): finding flow, trends, claim → evidence network, failure heatmap.
import { motion } from "motion/react"
import { useState } from "react"
import { WeekHourHeatmap } from "@/components/charts/bars"
import { FlowMap } from "@/components/charts/flow-map"
import { Sankey, TrendLine } from "@/components/charts/flow-charts"
import { Card, StagePanel } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { HBars } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Pill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import * as N from "@/lib/demo/insights"

export function AnalyticsView() {
  const [sel, setSel] = useState("DEF-142")
  const linked = N.EV_EDGES.filter((e) => e.from === sel || e.to === sel).map((e) => (e.from === sel ? e.to : e.from))
  const name = (id: string) => N.EV_NODES.find((n) => n.id === id)!.label
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Intelligence" title="Analytics" sub="Quality trends across the last 30 days for ShopFlow Commerce." />
      <StatStrip items={N.ANALYTICS_KPIS} />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="Finding flow · 44 findings, last 30 days" extra={<span className="text-[11px] text-muted-foreground tabular">24 / 44 verified fixed</span>}>
          <Sankey cols={N.FLOW_COLS} links={N.FLOW_LINKS} />
          <p className="mt-2 text-[12px] text-muted-foreground">Every finding Trevyn raises is either proven by execution, marked inconclusive, or overturned by a person. Only repairs that pass regression count as verified.</p>
        </Card>
        <Card title="Findings by type">
          <HBars rows={[["UI", 18, "brand"], ["API", 11, "det"], ["Security", 9, "bad"], ["Performance", 6, "warn"]]} />
          <div className="glass-inset mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl text-center">
            {([["31", "Confirmed", "text-bad"], ["8", "Inconclusive", "text-warn"], ["5", "Overturned", "text-human"]] as const).map(([v, l, c]) => (
              <div key={l} className="bg-white/40 px-2 py-2.5"><div className={`text-[24px] font-light tabular ${c}`}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Pass rate · 30 days"><TrendLine vals={N.PASS_30.vals} labels={N.PASS_30.labels} min={82} max={94} step={4} unit="%" name="Pass rate %" /></Card>
        <Card title="Mean time to resolve · weekly" extra={<Pill tone="ok">3.2 h this week</Pill>}>
          <TrendLine vals={N.MTTR.vals} labels={N.MTTR.labels} min={2} max={7} step={1} unit=" h" thr={4} thrL="Target 4 h" color="var(--det)" name="MTTR h" />
        </Card>
      </div>
      <StagePanel eyebrow="AI claim → evidence network" title="No claim without an artifact behind it"
        aside={
          <div className="flex flex-wrap gap-px overflow-hidden rounded-xl bg-white/50 text-center">
            {[["142", "Backed by execution", "#5cc8b2"], ["17", "Marked uncertain", "#e9c46a"], ["5", "Overturned by a person", "#f2b84b"]].map(([v, l, c]) => (
              <div key={l} className="bg-white/60 px-4 py-2"><div className="text-[24px] font-light tabular" style={{ color: c }}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        }
        footer={
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/70 px-4 py-3 text-[12.5px]">
            <span className="font-mono text-brand">{name(sel)}</span>
            <motion.span key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-foreground/80">linked to {linked.map(name).join(", ")}</motion.span>
            <span className="ml-auto text-[11px] text-muted-foreground">Click a node · teal: deterministic proof · yellow: partial · amber: needs a person</span>
          </div>
        }>
        <FlowMap pastel nodes={N.EV_NODES} edges={N.EV_EDGES} w={900} h={370} nw={178} sel={sel} onSelect={setSel} label="Claim to evidence network" />
      </StagePanel>
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="When failures happen · weekday × hour" extra={<span className="text-[11px] text-muted-foreground">Peak: Tue 15:00, deploy window</span>}>
          <WeekHourHeatmap rows={N.WEEKDAYS} data={N.WEEK_HEAT} />
        </Card>
        <Card flush title="Most flaky tests">
          <DataTable head={["Test", "Flake rate", "Cause"]}>
            {N.FLAKY.map((r) => <Row key={r[0]}><Cell className="font-mono text-[11.5px]">{r[0]}</Cell><Cell className="tabular">{r[1]}</Cell><Cell className="text-muted-foreground">{r[2]}</Cell></Row>)}
          </DataTable>
        </Card>
      </div>
    </div>
  )
}
