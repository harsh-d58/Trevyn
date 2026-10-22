"use client"
// Network & traces (from Network.jsx) + the "Platform" view: the live Trevyn pipeline from the prototype Overview.
import { AnimatePresence, motion } from "motion/react"
import { Radio } from "lucide-react"
import { useState } from "react"
import { Donut } from "@/components/charts/bars"
import { FlowMap } from "@/components/charts/flow-map"
import { Histogram, StackedArea } from "@/components/charts/flow-charts"
import { Waterfall } from "@/components/charts/timing"
import { PlatformPipeline } from "@/components/dashboard/platform-live"
import { Card } from "@/components/kit/card"
import { RangeToggle } from "@/components/kit/controls"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { Meter } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { MonoLabel, Pill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import { HAR } from "@/lib/demo/findings"
import * as N from "@/lib/demo/insights"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const DOT = { bad: "bg-bad", warn: "bg-warn", det: "bg-det", acc: "bg-brand", mut: "bg-muted-foreground", ai: "bg-ai", human: "bg-human" }

export function NetworkView() {
  const [view, setView] = useState<"App under test" | "Platform">("App under test")
  const [sel, setSel] = useState("orders")
  const n = N.NET_NODES.find((x) => x.id === sel)!
  const [rps, p95, err, note] = N.NET_INFO[sel]
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Quality engineering" title="Network & traces" sub="Traffic Trevyn captured while testing ShopFlow Commerce: service map, request timing and latency.">
        <Pill tone="brand" dot pulse>Capturing · live run</Pill>
        <Button variant="glass" size="pill" onClick={() => notify("checkout.har exported (demo file, 41 requests)")}><Radio />Export HAR</Button>
      </PageHeader>
      <StatStrip items={N.NET_KPIS} />
      <div className="flex items-center gap-3">
        <RangeToggle id="netview" value={view} options={["App under test", "Platform"]} onChange={setView} />
        <span className="text-[12px] text-muted-foreground">{view === "Platform" ? "Trevyn's own pipeline, moving with the live run" : "Services of the application being tested"}</span>
      </div>
      <AnimatePresence mode="wait">
        {view === "Platform" ? (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><PlatformPipeline /></motion.div>
        ) : (
          <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-3.5 xl:grid-cols-[2.2fr_1fr]">
            <Card title="Service map · app under test" extra={<span className="text-[11.5px] text-muted-foreground">Click a service</span>}>
              <FlowMap nodes={N.NET_NODES} edges={N.NET_EDGES} w={950} h={400} sel={sel} onSelect={setSel} label="Service map" />
            </Card>
            <Card title="Service detail">
              <motion.div key={sel} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                <div className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", DOT[n.k ?? "mut"])} /><h3 className="text-[24px] font-medium text-navy">{n.label}</h3></div>
                <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{n.sub}</p>
                <div className="glass-inset mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl">
                  {[["Throughput", rps], ["p95", p95], ["Errors", err]].map(([l, v]) => <div key={l} className="bg-white/40 px-3 py-2.5"><MonoLabel>{l}</MonoLabel><div className="mt-1 font-semibold tabular">{v}</div></div>)}
                </div>
                <p className="mt-4 text-[13px] leading-relaxed">{note}</p>
                <div className="mt-4 grid gap-1.5">
                  <MonoLabel>Connections</MonoLabel>
                  {N.NET_EDGES.filter((e) => e.from === sel || e.to === sel).map((e, i) => (
                    <button key={i} onClick={() => setSel(e.from === sel ? e.to : e.from)} className="press glass-inset flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left font-mono text-[11.5px] hover:border-brand/40">
                      <span>{e.from} → {e.to}</span><span className={e.k === "bad" ? "text-bad" : e.k === "warn" ? "text-warn" : "text-muted-foreground"}>{e.l || "ok"}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <Card title="Request waterfall · CHECKOUT-014 · WebKit" extra={<Pill tone="bad">1 duplicate request</Pill>}><Waterfall rows={HAR} total={1600} /></Card>
      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card title="Throughput by status (req/s)"><StackedArea labels={N.NET_THROUGHPUT.labels} series={N.NET_THROUGHPUT.series} max={500} step={100} /></Card>
        <Card title="Latency distribution (ms)" extra={<span className="font-mono text-[11.5px] text-muted-foreground">n = 9,248</span>}>
          <Histogram buckets={N.LATENCY_BUCKETS} marks={[["p50 · 150 ms", 2, "var(--brand)"], ["p95 · 800 ms", 7, "var(--bad)"]]} />
          <p className="mt-1 text-[11.5px] text-muted-foreground">Bars in red are above the 800 ms k6 threshold. 258 requests, almost all on /api/cart.</p>
        </Card>
      </div>
      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card title="Status codes">
          <div className="flex flex-wrap items-center gap-6">
            <Donut segs={N.STATUS_CODES} size={140} sw={16} label="Status code share">
              <div><div className="text-[20px] font-light tabular">96.1%</div><div className="text-[10px] text-muted-foreground">2xx success</div></div>
            </Donut>
            <div className="grid min-w-40 flex-1 gap-2">
              {N.STATUS_CODES.map(([k, p, c]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-[13px] last:border-0">
                  <span className="flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: c }} /><span className="font-mono">{k}</span></span><b className="font-semibold tabular">{p}%</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card flush title="Top endpoints by p95">
          <DataTable head={["Method", "Path", "req/s", "p95", ""]}>
            {N.TOP_ENDPOINTS.map(([m, u, r, p, hot]) => (
              <Row key={m + u}>
                <Cell className={cn("font-mono text-[11.5px] font-semibold", m === "GET" ? "text-det" : "text-brand")}>{m}</Cell><Cell className="font-mono text-[11.5px]">{u}</Cell>
                <Cell className="text-muted-foreground tabular">{r}</Cell><Cell className={cn("tabular", hot && "font-semibold text-bad")}>{p.toLocaleString()} ms</Cell>
                <Cell className="w-1/4"><div className="flex"><Meter p={(p / 1810) * 100} c={hot ? "bad" : "brand"} /></div></Cell>
              </Row>
            ))}
          </DataTable>
        </Card>
      </div>
    </div>
  )
}
