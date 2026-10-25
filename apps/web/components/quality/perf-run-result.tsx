import { API_URL } from "@/lib/api"
import { FlowMap } from "@/components/charts/flow-map"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, type Tone } from "@/components/kit/pills"
import { ScrollCard } from "./scroll-card"

type Vital = { case: string; path: string; metric: string; value: number | null; budget: number | null; status: string; evidence?: string | null }
type Audit = { page: string; score: number; evidence?: string | null }
type AuditMetric = { page: string; metric: string; value: number; unit: string; status: string; budget?: number | null }
type Request = { case: string; resourceType: string; path: string; ms: number; responseBytes?: number | null; status?: number }
type Navigation = { case: string; summary: string; status: string; data?: { navigation?: { responseStartMs?: number; loadMs?: number } } }
export type PerfRunData = {
  run: { id: string; display_id: string; name: string; state: string }
  reason?: string; web_vitals?: Vital[]; lighthouse?: Audit[]; lighthouse_metrics?: AuditMetric[]
  slow_requests?: Request[]; navigation?: Navigation[]; load_test?: string
}
export type PerfGraph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

const METRICS: Record<string, { name: string; meaning: string; next: string }> = {
  LCP: { name: "Main content appears", meaning: "How long the largest visible page element takes to appear.", next: "Check large page resources and work that delays the first render." },
  TTFB: { name: "First server response", meaning: "How long the browser waits for the first response byte.", next: "Review server, hosting, cache and redirect timing." },
  CLS: { name: "Layout movement", meaning: "How much visible content shifts unexpectedly while the page loads.", next: "Reserve space for images, embeds and content loaded later." },
  INP: { name: "Response to interaction", meaning: "How quickly the page responds to a user action.", next: "Record an interaction before drawing a conclusion." },
  TBT: { name: "Main-thread blocking", meaning: "Time spent on long tasks that can delay a response to input.", next: "Inspect scripts and long browser tasks." },
  FCP: { name: "First content appears", meaning: "How quickly the first visible content is painted.", next: "Review resources needed for the initial render." },
  SI: { name: "Visible-page speed", meaning: "How quickly the visible page fills in during the audit.", next: "Inspect the audit filmstrip and resources." },
}
const metricName = (metric: string) => METRICS[metric]?.name ?? metric
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const measured = (v: number, metric: string) => metric === "CLS" ? v.toFixed(2) : seconds(v)
const pathOf = (url: string) => { try { return new URL(url).pathname || "/" } catch { return url || "/" } }
const pageName = (path: string) => path === "/" ? "Home" : path.split("/").filter(Boolean).at(-1)?.replace(/\.[^.]+$/, "").replaceAll("-", " ") || path
const statusTone = (status: string): Tone => status === "failed" ? "bad" : status === "needs improvement" ? "warn" : status === "passed" ? "ok" : "mut"
const statusLabel = (status: string) => status === "failed" ? "Over target" : status === "needs improvement" ? "Needs improvement" : status === "passed" ? "Met target" : "Not measured"
const readableFile = (path: string) => {
  const file = path.split("/").filter(Boolean).at(-1) || "Home page"
  try { return decodeURIComponent(file).replaceAll("_", " ") } catch { return file.replaceAll("_", " ") }
}
const resourceName = (type: string) => ({ media: "Video", document: "Page", image: "Image", font: "Font", script: "Script", stylesheet: "Style" })[type] ?? (type || "Resource")
const bytes = (value: number) => value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`

export function PerfRunResult({ data, diagrams }: { data: PerfRunData; diagrams: { name: string; graph: PerfGraph | null }[] }) {
  const vitals = data.web_vitals ?? []
  const audits = data.lighthouse ?? []
  const auditMetrics = data.lighthouse_metrics ?? []
  const requests = data.slow_requests ?? []
  const longestRequestMs = Math.max(1, ...requests.map((request) => request.ms || 0))
  const navigation = data.navigation ?? []
  const lcp = vitals.filter((v) => v.metric === "LCP" && v.value != null)
  const slowLcp = lcp.filter((v) => v.status === "failed")
  const slowTtfb = vitals.filter((v) => v.metric === "TTFB" && v.status === "failed")
  const shifted = vitals.filter((v) => v.metric === "CLS" && v.status === "failed")
  const missingInp = vitals.filter((v) => v.metric === "INP" && v.status === "not run")
  const worstLcp = [...slowLcp].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
  const paths = [...new Set(vitals.map((v) => v.path))]
  const groups = new Map<string, { path: string; metric: string; count: number; worst: Vital }>()
  for (const vital of vitals.filter((v) => v.status === "failed" && v.value != null)) {
    const key = `${vital.path}\u0000${vital.metric}`
    const group = groups.get(key)
    if (!group) groups.set(key, { path: vital.path, metric: vital.metric, count: 1, worst: vital })
    else { group.count += 1; if ((vital.value ?? 0) > (group.worst.value ?? 0)) group.worst = vital }
  }
  const priorities = [...groups.values()].sort((a, b) => ((b.worst.value ?? 0) / (b.worst.budget || 1)) - ((a.worst.value ?? 0) / (a.worst.budget || 1)))

  return <div className="grid gap-3.5">
    <PageHeader title="Performance" />

    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{lcp.length ? `${slowLcp.length} of ${lcp.length} measured views were slow to show main content` : "No browser loading measurements yet"}</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{worstLcp ? `The slowest recorded view was ${pageName(worstLcp.path)} (${worstLcp.path}) at ${measured(worstLcp.value!, "LCP")}, against a ${measured(worstLcp.budget ?? 2500, "LCP")} target. Repeat visits count separately.` : "This page will explain loading measurements as the run records them."}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
        <span><b className="text-foreground">{slowTtfb.length}</b> slow first responses</span>
        <span><b className="text-foreground">{shifted.length}</b> layout-shift misses</span>
        <span><b className="text-foreground">{audits.length}</b> separate Lighthouse audits</span>
      </div>
      {data.reason && <p className="mt-2 text-[11.5px] text-muted-foreground">{data.reason}</p>}
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title="Investigate first">
        {priorities.length ? <div className="divide-y divide-border">{priorities.map(({ path, metric, count, worst }) => <div key={`${path}:${metric}`} className="py-3 first:pt-0">
          <div className="flex flex-wrap items-center gap-2"><Pill tone="bad">Over target</Pill><b className="text-[13px]">{metricName(metric)} on {pageName(path)}</b></div>
          <p className="mt-1 text-[12px] text-muted-foreground">{count} measured visit{count === 1 ? "" : "s"} missed the target · worst {measured(worst.value!, metric)}{worst.budget != null ? ` versus ${measured(worst.budget, metric)} target` : ""} · {path}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{METRICS[metric]?.meaning} Suggested next check: {METRICS[metric]?.next}</p>
        </div>)}</div> : <p className="text-[13px] text-muted-foreground">{vitals.length ? "No recorded browser measurements missed their targets." : "No measurements have been recorded."}</p>}
      </ScrollCard>

      <ScrollCard title="Browser measurements" caption="Worst value per page; repeat visits included">
        {paths.length ? <div className="divide-y divide-border">{paths.map((path) => {
          const page = vitals.filter((v) => v.path === path)
          const visits = Math.max(...Object.values(Object.groupBy(page, (v) => v.metric)).map((items) => items?.length ?? 0))
          return <details key={path} className="py-2.5 first:pt-0">
            <summary className="cursor-pointer text-[13px] font-semibold">{pageName(path)} <span className="ml-1 font-normal text-muted-foreground">{path} · {visits} visit{visits === 1 ? "" : "s"}</span></summary>
            <div className="mt-2 grid gap-2">{["LCP", "TTFB", "CLS", "INP"].map((metric) => {
              const values = page.filter((v) => v.metric === metric && v.value != null)
              const worst = [...values].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
              return <div key={metric} className="flex flex-wrap items-center gap-2 text-[12px]"><span className="w-40 font-medium">{metricName(metric)}</span>{worst ? <><b>{measured(worst.value!, metric)}</b><Pill tone={statusTone(worst.status)}>{statusLabel(worst.status)}</Pill>{worst.budget != null && <span className="text-muted-foreground">target {measured(worst.budget, metric)}</span>}{worst.evidence && <a className="text-brand hover:underline" href={API_URL + worst.evidence} target="_blank" rel="noreferrer">Evidence</a>}</> : <span className="text-muted-foreground">Not measured</span>}</div>
            })}</div>
          </details>
        })}</div> : <p className="text-[13px] text-muted-foreground">No page-level browser measurements were recorded.</p>}
      </ScrollCard>

      <ScrollCard title="Lighthouse audits" caption="Separate lab tests; results can differ from browser visits">
        {audits.length ? <div className="divide-y divide-border">{audits.map((audit) => {
          const path = pathOf(audit.page)
          const metrics = auditMetrics.filter((m) => m.page === audit.page)
          const concerns = metrics.filter((m) => m.status === "failed" || m.status === "needs improvement")
          return <details key={audit.page} className="py-2.5 first:pt-0">
            <summary className="cursor-pointer text-[13px]"><span className="flex items-center justify-between gap-3"><span><b>{pageName(path)}</b><span className="ml-2 text-muted-foreground">{path}</span></span><b>{audit.score}/100</b></span><span className="mt-1 block text-[11.5px] text-muted-foreground">{concerns.length ? `Audit flagged ${concerns.map((m) => metricName(m.metric).toLowerCase()).join(", ")}.` : "No metric was flagged by this audit."}</span></summary>
            <div className="mt-2 grid gap-2 text-[12px]">{metrics.map((m) => <div key={m.metric} className="flex flex-wrap items-center gap-2"><span className="w-40 font-medium">{metricName(m.metric)}</span><span>{m.unit === "score" ? m.value.toFixed(2) : seconds(m.value)}</span><Pill tone={statusTone(m.status)}>{statusLabel(m.status)}</Pill>{m.budget != null && <span className="text-muted-foreground">target {m.unit === "score" ? m.budget.toFixed(2) : seconds(m.budget)}</span>}</div>)}
              {audit.evidence && <a href={API_URL + audit.evidence} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Open full audit</a>}
            </div>
          </details>
        })}</div> : <p className="text-[13px] text-muted-foreground">No Lighthouse audits were recorded for this run.</p>}
      </ScrollCard>

      <ScrollCard title={`Slow network requests · ${requests.length}`} caption="Bars compare response times; they do not show cause">
        {requests.length ? <div className="divide-y divide-border">{requests.map((request, i) => <div key={`${request.case}:${request.path}:${i}`} className="py-2.5 first:pt-0">
          <div className="grid grid-cols-[minmax(0,9rem)_minmax(2rem,1fr)_3.5rem] items-center gap-2 text-[12px] sm:grid-cols-[minmax(0,12rem)_minmax(2rem,1fr)_3.5rem]">
            <b className="truncate" title={request.path}>{resourceName(request.resourceType)} · {readableFile(request.path)}</b>
            <span className="h-2 rounded-full bg-white/45" aria-hidden="true"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, 100 * request.ms / longestRequestMs)}%` }} /></span>
            <strong className="text-right tabular-nums">{seconds(request.ms)}</strong>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Observed during {request.case}{request.responseBytes != null ? ` · ${bytes(request.responseBytes)} response` : ""}{request.status ? ` · HTTP ${request.status}` : ""}</p>
          <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Request path</summary><p className="mt-1 break-all font-mono">{request.path}</p></details>
        </div>)}</div> : <p className="text-[13px] text-muted-foreground">No network request timing was recorded.</p>}
      </ScrollCard>

      <ScrollCard title="Page opening times" caption="First response and full load are different events">
        {navigation.length ? <div className="divide-y divide-border">{navigation.map((event, i) => {
          const path = event.summary.match(/goto\s+(.+)$/)?.[1] ?? "the page"
          const timing = event.data?.navigation
          return <div key={`${event.case}:${i}`} className="py-2.5 first:pt-0">
            <p className="text-[13px] font-semibold">Opened {path} <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">{event.case}</span></p>
            <p className="mt-1 text-[12px] text-muted-foreground">{timing?.responseStartMs != null ? `First response ${seconds(timing.responseStartMs)}` : "First response not recorded"} · {timing?.loadMs != null ? `Page load ${seconds(timing.loadMs)}` : "Page load not recorded"}</p>
          </div>
        })}</div> : <p className="text-[13px] text-muted-foreground">No browser navigation timing was recorded.</p>}
      </ScrollCard>

      <ScrollCard title="Not measured" size="summary">
        <p className="text-[13px] font-semibold">Response to interaction (INP)</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{missingInp.length ? `No interaction timing was captured in ${missingInp.length} browser visit${missingInp.length === 1 ? "" : "s"}. This says nothing about how responsive the pages are when used.` : "No interaction timing result is available in this run."}</p>
        <p className="mt-3 text-[13px] font-semibold">Traffic under multiple users</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{data.load_test === "not run" ? "A load test was not run. These results do not show how the site behaves with many users at once." : data.load_test ? `Load test status: ${data.load_test}.` : "No load-test result is available."}</p>
      </ScrollCard>
    </div>

    {diagrams.some(({ graph }) => graph?.nodes.length) && <section aria-label="Run diagrams" className="grid gap-3.5">
      {diagrams.map(({ name, graph }) => graph?.nodes.length ? <ScrollCard key={name} title={`${name} map`} size="diagram"><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={name} /></ScrollCard> : null)}
    </section>}
  </div>
}
