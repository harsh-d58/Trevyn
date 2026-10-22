"use client"
// Quality engineering pages, ported from trevyn-app Quality.jsx: Browser & UI, API, Performance,
// Security, Compatibility. Data in lib/demo/quality.ts.
import Link from "next/link"
import { motion } from "motion/react"
import { CircleAlert, CircleCheck, CirclePlay, CircleX, Layers, Shield, Sparkles } from "lucide-react"
import { useState } from "react"
import { Donut, DotRange, LatencyHeatmap, StackBars } from "@/components/charts/bars"
import { FlowMap } from "@/components/charts/flow-map"
import { PlainLine, StackedArea, TrendLine } from "@/components/charts/flow-charts"
import { Sparkline } from "@/components/charts/progress"
import { Card, StagePanel, StageStats } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { HBars, Meter, Note } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { MonoLabel, Pill, Severity } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import * as Q from "@/lib/demo/quality"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const runBtn = (label: string, Icon = CirclePlay, href?: string) =>
  href ? <Button variant="brand" size="pill" render={<Link href={href} />}><Icon />{label}</Button>
    : <Button variant="brand" size="pill" onClick={() => notify(`${label}: queued in the demo. Runs go through the policy gate first.`, "det")}><Icon />{label}</Button>

/* ---------------- Browser & UI ---------------- */
export function UiTestingView() {
  const [sel, setSel] = useState(3)
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Browser & UI testing" sub="User-journey exploration across engines, with Playwright traces as evidence.">{runBtn("Run UI suite", CirclePlay, "/runs/new")}</PageHeader>
      <div className="glass-1 grid grid-cols-2 gap-px overflow-hidden rounded-[22px] sm:grid-cols-3 lg:grid-cols-5">
        {Q.BROWSERS.map(([b, d, p]) => (
          <div key={b + d} className="bg-white/30 p-4">
            <div className="flex justify-between text-[13px]"><b className="font-semibold">{b}</b><span className="text-[11.5px] text-muted-foreground">{d}</span></div>
            <div className="my-1 text-[24px] font-light tabular">{p}<span className="text-[13px] text-muted-foreground">/46</span></div>
            <div className="flex"><Meter p={(p / 46) * 100} c={p === 46 ? "ok" : "warn"} /></div>
          </div>
        ))}
      </div>
      <Card title="Trace viewer · CHECKOUT-014 · WebKit" extra={<Pill tone="bad">Failed at step 4</Pill>}>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {Q.FRAMES.map((a, i) => (
            <button key={a} onClick={() => setSel(i)} title={a} aria-pressed={sel === i}
              className={cn("press glass-inset flex aspect-[4/3] max-w-full flex-col gap-1 rounded-xl border p-1.5 text-left transition", sel === i ? "border-brand ring-2 ring-brand/25" : i >= 3 ? "border-bad/60" : "")}>
              <i className="block h-1.5 w-3/5 rounded bg-black/10" /><i className="block h-1.5 rounded bg-black/10" /><i className="block h-1.5 w-4/5 rounded bg-black/10" />
              <i className={cn("block h-3.5 rounded opacity-35", i >= 3 ? "bg-bad" : "bg-brand")} style={{ width: `${30 + i * 10}%` }} />
              <span className="mt-auto truncate text-[11px] text-muted-foreground">{a}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3.5 md:grid-cols-2">
          <div><h4 className="mb-2 text-[13px] font-semibold">Actions</h4>
            {Q.ACTIONS.map(([a, t], i) => <div key={a} className={cn("flex justify-between gap-3 border-b border-border py-1.5 font-mono text-[11.5px]", i === 4 && "text-bad")}><span className="break-all">{a}</span><span className="shrink-0">{t}</span></div>)}
          </div>
          <motion.div key={sel} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>
            <h4 className="mb-2 text-[13px] font-semibold">Selected frame</h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] [&_dd]:font-medium [&_dt]:text-muted-foreground">
              <dt>Action</dt><dd className="font-mono text-[11.5px]">{Q.FRAMES[sel]}</dd><dt>Viewport</dt><dd>1280 × 720</dd>
              <dt>Console</dt><dd className={sel >= 3 ? "text-warn" : ""}>{sel >= 3 ? "1 warning" : "Clean"}</dd><dt>Network</dt><dd>{sel >= 3 ? "2 × POST /api/orders" : "No pending requests"}</dd>
            </dl>
          </motion.div>
        </div>
      </Card>
      <div className="grid gap-3.5 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Page weight by resource type · /checkout (KB)" extra={<span className="font-mono text-[11.5px] text-muted-foreground">cold cache</span>}>
          <StackBars keys={Q.RESOURCES} max={2000} step={500} unit=" KB" rows={Q.PAGE_WEIGHT} />
          <p className="mt-2 text-[11.5px] text-muted-foreground">Safari on iPhone pulls 2× product images (srcset picks the 1600w variant). WebKit XHR doubles because of the DEF-142 retry.</p>
        </Card>
        <Card title="Largest contentful paint · /checkout (ms)">
          <StatStrip compact className="mb-4 lg:grid-cols-3!" items={[["Budget", "2 500 ms"], ["Worst", "2 910 ms", undefined, "bad"], ["Median", "1 640 ms"]]} />
          <HBars rows={Q.LCP} />
        </Card>
      </div>
    </div>
  )
}

/* ---------------- API & integration ---------------- */
const Ic = ({ k }: { k: Q.Check }) => k === "ok" ? <CircleCheck size={16} className="text-ok" /> : k === "warn" ? <CircleAlert size={16} className="text-warn" /> : <CircleX size={16} className="text-bad" />
export function ApiTestingView() {
  return (
    <div className="grid gap-3.5">
      <PageHeader title="API & integration testing" sub="Contract, auth and business-rule checks against the OpenAPI schema.">{runBtn("Run API suite")}</PageHeader>
      <StatStrip items={Q.API_KPIS} />
      <Card title="Endpoint call graph · RUN-0412 · openapi.yaml v3.4" extra={<div className="flex gap-2"><Pill tone="bad">3 failing</Pill><Pill tone="warn">1 warning</Pill></div>}>
        <FlowMap nodes={Q.API_NODES} edges={Q.API_EDGES} w={1100} h={420} nw={186} minW={900} label="Endpoint call graph" />
        <p className="mt-1 text-[11.5px] text-muted-foreground">Red paths are failing checks traced through to the service and store they reach. The 2× POST on /api/orders writes two rows to orders: client retries after a 450 ms timeout with no Idempotency-Key.</p>
      </Card>
      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card title="Responses by status code (req/s)" extra={<span className="font-mono text-[11.5px] text-muted-foreground">suite runtime 14 min</span>}>
          <StackedArea labels={Q.API_STATUS.labels} series={Q.API_STATUS.series} max={120} step={40} />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">The 4xx bump at 9–11 min is the auth probe (401/403 expected). /auth/token never answers 429.</p>
        </Card>
        <Card title="Latency p50 → p95 by endpoint">
          <DotRange rows={Q.ENDPOINTS.map((r) => [`${r.m} ${r.path}`, r.p50, r.p95])} max={500} step={100} thr={400} thrL="SLO p95 < 400 ms" lw={190} />
        </Card>
      </div>
      <Card flush title="Endpoints">
        <DataTable head={["Method", "Endpoint", "Contract", "Auth", "Business rules", "p50", "p95", "p95 · last 14 runs"]} minWidth={860}>
          {Q.ENDPOINTS.map((r) => (
            <Row key={r.m + r.path}>
              <Cell><Pill tone={r.m === "GET" ? "det" : "brand"} className="font-mono">{r.m}</Pill></Cell><Cell className="font-mono text-[11.5px]">{r.path}</Cell>
              <Cell><Ic k={r.contract} /></Cell><Cell><Ic k={r.auth} /></Cell><Cell><Ic k={r.rules} /></Cell>
              <Cell className="tabular">{r.p50} ms</Cell><Cell className={cn("tabular", r.p95 > 400 && "font-semibold text-bad")}>{r.p95} ms</Cell>
              <Cell><Sparkline v={r.trend} color={r.p95 > 400 ? "var(--bad)" : r.rules === "bad" || r.auth !== "ok" ? "var(--warn)" : "var(--det)"} /></Cell>
            </Row>
          ))}
        </DataTable>
      </Card>
    </div>
  )
}

/* ---------------- Performance ---------------- */
export function PerfView() {
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Performance testing" sub="k6 load test · /api/cart · ramp to 200 virtual users over 12 minutes.">{runBtn("Rerun k6 scenario")}</PageHeader>
      <StatStrip compact items={Q.PERF_STRIP} />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="Virtual users vs p95 response time" extra={<Pill tone="bad">Threshold breached</Pill>}>
          <MonoLabel>Virtual users</MonoLabel>
          <PlainLine vals={Q.VUS} labels={Q.MINUTES} max={200} color="var(--det)" h={130} name="VUs" thr={175} thrL="175 VUs · p95 crosses 800 ms" />
          <div className="mt-2"><MonoLabel>p95 response time (ms)</MonoLabel></div>
          <TrendLine vals={Q.P95} labels={Q.MINUTES} min={0} max={2000} step={500} thr={800} thrL="Threshold p95 < 800 ms" color="var(--warn)" h={210} name="p95 ms" />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Both panels share the time axis. VUs plateau at 200 from minute 10 while p95 keeps climbing: the database, not the load generator, is saturating.</p>
        </Card>
        <Card title="k6 thresholds">
          <div className="grid gap-3">{Q.THRESHOLDS.map(([n, v, c]) => <div key={n} className="flex items-start justify-between gap-2"><span className="font-mono text-[11.5px] break-all">{n}</span><Pill tone={c}>{v}</Pill></div>)}</div>
          <Note icon={Sparkles} className="mt-3.5">Likely cause: N+1 query in cart pricing (37 queries per request at 200 VUs). Evidence: DB query log, run RUN-0408.</Note>
          <div className="mt-3.5 grid gap-1.5"><MonoLabel>Queries per request · cart-svc</MonoLabel>
            <HBars rows={[["10 VUs", 4, "det"], ["100 VUs", 19, "warn"], ["200 VUs", 37, "bad"]]} />
          </div>
        </Card>
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Latency heatmap · GET /api/cart" extra={<span className="font-mono text-[11.5px] text-muted-foreground">n = 148,210</span>}>
          <LatencyHeatmap cols={Q.MINUTES} rows={Q.BUCKETS} data={Q.LATENCY_HEAT} thr={3} thrL="k6 threshold · 800 ms" foot={["VUs", Q.VUS]} />
        </Card>
        <Card title="Error rate vs virtual users">
          <TrendLine vals={Q.ERROR_RATE.vals} labels={Q.ERROR_RATE.labels} min={0} max={1.5} step={0.5} unit="%" thr={1} thrL="http_req_failed < 1%" color="var(--bad)" h={230} name="Error rate %" />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Errors are 504s from the gateway once cart-svc requests queue past 30 s. Run-wide rate stays at 0.4%, so the failure threshold still passes.</p>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- Security ---------------- */
export function SecurityView() {
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Security testing" sub="OWASP ZAP baseline scans and Semgrep static analysis, mapped to the OWASP Testing Guide.">{runBtn("Run security scan", Shield)}</PageHeader>
      <StatStrip items={Q.SECURITY_KPIS} />
      <StagePanel eyebrow="Attack surface · entry point → OWASP category → asset" title="5 entry points · 2 open paths to user data"
        legend={[["#f27fae", "Open · high"], ["#e9c46a", "Open · medium"], ["#5cc8b2", "Mitigated"], ["#8fa8ff", "Entry point"]]}
        footer={<StageStats items={[["Scan mode", "Passive"], ["Requests sent", "3,184"], ["Semgrep rules", "412"], ["Active scan", "Needs approval"]]} />}>
        <FlowMap pastel nodes={Q.ATTACK_NODES} edges={Q.ATTACK_EDGES} w={900} h={405} nw={196} minW={760} label="Attack surface" />
      </StagePanel>
      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.9fr]">
        <Card title="Severity by OWASP category">
          <StackBars lw={150} max={5} step={1} keys={[["h", "High", "var(--bad)"], ["m", "Medium", "var(--warn)"], ["l", "Low", "color-mix(in srgb, var(--muted-foreground) 45%, white)"]]} rows={Q.OWASP_ROWS} />
        </Card>
        <Card flush title="Findings" extra={<span className="text-[11.5px] text-muted-foreground">Passive mode · active scans need approval</span>}>
          <DataTable head={["Tool", "Rule", "OWASP category", "Location", "Severity", "Status"]} minWidth={820}>
            {Q.SEC_FINDINGS.map((r) => (
              <Row key={r[1]}><Cell><Pill tone="det">{r[0]}</Pill></Cell><Cell className="font-mono text-[11.5px]">{r[1]}</Cell><Cell>{r[2]}</Cell><Cell className="font-mono text-[11.5px]">{r[3]}</Cell><Cell><Severity s={r[4]} /></Cell><Cell>{r[5]}</Cell></Row>
            ))}
          </DataTable>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- Compatibility ---------------- */
const CELL: Record<Q.Cell, [string, string]> = { ok: ["Pass", "bg-ok/15 text-ok"], warn: ["Warn", "bg-warn/15 text-warn"], bad: ["Fail", "bg-bad/15 text-bad"], na: ["N/A", "bg-black/5 text-muted-foreground"] }
export function CompatView() {
  const cells = Q.MATRIX.flatMap(([, ...c]) => c)
  const cnt = (k: Q.Cell) => cells.filter((c) => c === k).length
  const run = cnt("ok") + cnt("warn") + cnt("bad")
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Compatibility matrix" sub="Cross-OS CI runs of the checkout journey · nightly · Oct 21.">{runBtn("Run matrix", Layers)}</PageHeader>
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="Checkout journey · 5 OS × 4 browsers">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead><tr><th className="px-3 py-2 text-left font-mono text-[10.5px] tracking-[.12em] text-muted-foreground uppercase">OS</th>{Q.COMPAT_BROWSERS.map((b) => <th key={b} className="px-3 py-2 text-center font-mono text-[10.5px] tracking-[.12em] text-muted-foreground uppercase">{b}</th>)}</tr></thead>
              <tbody>
                {Q.MATRIX.map(([o, ...c], ri) => (
                  <tr key={o}><td className="border-t border-border px-3 py-2 font-medium">{o}</td>
                    {c.map((k, i) => <td key={i} className="border-t border-border px-2 py-2"><motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: ri * 0.05 + i * 0.03 }} className={cn("rounded-lg py-2 text-center text-[11.5px] font-semibold", CELL[k][1])}>{CELL[k][0]}</motion.div></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11.5px] text-muted-foreground">iOS Safari fails CHECKOUT-021: Apple Pay sheet blocks the confirm button. macOS Safari warning is DEF-137 (autofill focus).</p>
        </Card>
        <Card title="Pass rate by OS">
          <div className="glass-inset flex items-center gap-5 rounded-2xl p-3.5">
            <Donut segs={[["Pass", cnt("ok"), "var(--ok)"], ["Warn", cnt("warn"), "var(--warn)"], ["Fail", cnt("bad"), "var(--bad)"]]} size={112} sw={13} label="Matrix cells by result">
              <div><div className="text-[24px] leading-none font-light text-navy tabular">{Math.round((cnt("ok") / run) * 100)}%</div><div className="mt-0.5 text-[10.5px] text-muted-foreground">cells pass</div></div>
            </Donut>
            <div className="grid gap-1.5 text-[12.5px]">
              {([["ok", "Pass"], ["warn", "Warn"], ["bad", "Fail"]] as const).map(([k, l]) => <span key={k} className="flex items-center gap-2"><i className={cn("size-2.5 rounded-full", `bg-${k}`)} />{l}<b className="ml-auto pl-4 font-semibold tabular">{cnt(k)}</b></span>)}
              <span className="flex items-center gap-2 text-muted-foreground"><i className="size-2.5 rounded-full bg-black/15" />Not run<b className="ml-auto pl-4 font-semibold tabular">{cnt("na")}</b></span>
            </div>
          </div>
          <div className="mt-4 grid gap-3"><MonoLabel>Test-level pass rate · 46 checkout tests</MonoLabel>
            {Q.OS_PASS.map(([o, p, c]) => <div key={o}><div className="mb-1 flex justify-between text-[12.5px]"><span>{o}</span><b className={cn("font-semibold tabular", c === "bad" && "text-bad")}>{p.toFixed(1)}%</b></div><div className="flex"><Meter p={p} c={c} /></div></div>)}
          </div>
        </Card>
      </div>
    </div>
  )
}
