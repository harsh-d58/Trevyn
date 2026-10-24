// Network & traces from GET /api/insights/network (ANALYTICS.md M5): every request the UI lane captured,
// grouped by endpoint, with status codes, timings and one case's waterfall.
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { HBars, type MeterTone } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Empty } from "@/components/kit/page-loading"
import { Pill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import type { LiveNetwork } from "@/lib/live-data"
import { cn } from "@/lib/utils"

const CODE_TONE: Record<string, MeterTone> = { "2xx": "ok", "3xx": "det", "4xx": "warn", "5xx": "bad", "no response": "human" }
const ms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v} ms`)

function Waterfall({ w }: { w: NonNullable<LiveNetwork["waterfall"]> }) {
  const end = Math.max(1, ...w.requests.map((r) => r.t + (r.ms ?? 0)))
  return (
    <ul className="grid gap-1 font-mono text-[11px]">
      {w.requests.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,14rem)_1fr_4.5rem] items-center gap-2">
          <span className="truncate" title={`${r.method} ${r.path}`}><span className="text-muted-foreground">{r.method}</span> {r.path}</span>
          <span className="relative h-2.5 rounded-full bg-white/40">
            <span className={cn("absolute top-0 h-full min-w-1 rounded-full", (r.status ?? 0) >= 400 ? "bg-bad" : r.method === "POST" ? "bg-ai" : "bg-det")}
              style={{ left: `${(100 * r.t) / end}%`, width: `${(100 * (r.ms ?? 0)) / end}%` }} />
          </span>
          <span className="text-right tabular text-muted-foreground">{r.status ?? "—"} · {r.ms ?? "?"}</span>
        </li>
      ))}
    </ul>
  )
}

export function LiveNetworkView({ data }: { data: LiveNetwork }) {
  const timed = data.endpoints.filter((e) => e.p95 !== null)
  const slow = [...timed].sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 8)
  const codes = Object.entries(data.statusCodes)
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Quality engines" title="Network & traces" sub="Requests captured by the browser during test journeys, across all runs." />
      <StatStrip items={[
        ["Requests", data.totals.requests, `${data.files} captured journeys`, "det"],
        ["Errors (4xx/5xx)", data.totals.errors, data.totals.requests ? `${((100 * data.totals.errors) / data.totals.requests).toFixed(1)}% of requests` : "—", data.totals.errors ? "bad" : "ok"],
        ["Duplicate POSTs", data.totals.duplicatePosts, "Same POST twice within 2 s", data.totals.duplicatePosts ? "bad" : "ok"],
        ["Endpoints", data.endpoints.length, `${timed.length} with timings`, "brand"],
      ]} />
      {!data.files ? <Card title="No traffic captured yet"><Empty what="Nothing to show" why="Each UI test case records its network log; run a test to fill this page." /></Card> : <>
        <div className="grid gap-3.5 xl:grid-cols-[1fr_2fr]">
          <Card title="Status codes">
            <HBars rows={codes.map(([k, v]) => [k, v, CODE_TONE[k] ?? "brand"])} />
          </Card>
          <Card title="Slowest endpoints by p95" flush>
            {slow.length ? <DataTable head={["Endpoint", "p50", "p95", "Requests"]}>
              {slow.map((e) => <Row key={e.method + e.path}><Cell className="font-mono text-[11.5px]"><span className="text-muted-foreground">{e.method}</span> {e.path}</Cell>
                <Cell className="tabular">{ms(e.p50)}</Cell><Cell className="tabular">{ms(e.p95)}</Cell><Cell className="tabular">{e.requests}</Cell></Row>)}
            </DataTable> : <Empty what="No timings yet" why="Runs from this version on record how long each request takes." />}
          </Card>
        </div>
        {data.waterfall && <Card title={`Request waterfall · ${data.waterfall.case}`} caption="Latest captured journey · start and duration in ms · teal GET, violet POST, red errors">
          <Waterfall w={data.waterfall} />
        </Card>}
        <Card title="All endpoints" flush>
          <DataTable head={["Endpoint", "Requests", "Errors", "Duplicate POSTs", "p95"]}>
            {data.endpoints.map((e) => <Row key={e.method + e.path}>
              <Cell className="font-mono text-[11.5px]"><span className="text-muted-foreground">{e.method}</span> {e.path}</Cell>
              <Cell className="tabular">{e.requests}</Cell>
              <Cell className="tabular">{e.errors ? <Pill tone="bad">{e.errors}</Pill> : 0}</Cell>
              <Cell className="tabular">{e.duplicatePosts ? <Pill tone="bad">{e.duplicatePosts}</Pill> : 0}</Cell>
              <Cell className="tabular">{ms(e.p95)}</Cell>
            </Row>)}
          </DataTable>
        </Card>
      </>}
    </div>
  )
}
