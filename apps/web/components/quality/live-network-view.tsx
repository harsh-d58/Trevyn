"use client"

import { useState } from "react"
import { API_URL, api } from "@/lib/api"
import { useLive } from "@/lib/live"
import type { LiveNetwork } from "@/lib/live-data"
import { FlowMap } from "@/components/charts/flow-map"
import { HBars, type MeterTone } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Pill } from "@/components/kit/pills"
import { ScrollCard } from "./scroll-card"
import { cn } from "@/lib/utils"

type NetworkGraph = { nodes: { id: string; label: string; sub: string; x: number; y: number; k?: "det" | "acc" | "mut" }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }
type Endpoint = LiveNetwork["endpoints"][number]

const seconds = (value: number) => `${(value / 1000).toFixed(1)} s`
const timing = (value: number | null) => value == null ? "Not recorded" : value < 1000 ? `${value} ms` : seconds(value)
const statusName = (code: string) => code === "1xx" ? "Informational responses" : code === "2xx" ? "Successful responses" : code === "3xx" ? "Redirects" : code === "4xx" ? "Client errors" : "Server errors"
const statusTone = (code: string): MeterTone => code === "2xx" ? "ok" : code === "1xx" || code === "3xx" ? "det" : code === "4xx" ? "warn" : code === "5xx" ? "bad" : "human"
const readableFile = (path: string) => {
  if (path === "/") return "Home page"
  const file = path.split("/").filter(Boolean).at(-1) || path
  try { return decodeURIComponent(file).replaceAll("_", " ") } catch { return file.replaceAll("_", " ") }
}
const resourceKind = (path: string) => /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(path) ? "Image" : /\.(mp4|webm|mov)$/i.test(path) ? "Video" : /\.(woff2?|ttf|otf)$/i.test(path) ? "Font" : /\.css$/i.test(path) ? "Style" : /\.js$/i.test(path) ? "Script" : "Page or endpoint"

function RequestBar({ endpoint, max }: { endpoint: Endpoint; max: number }) {
  return <div className="py-2.5 first:pt-0">
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(2rem,1fr)_3.5rem] items-center gap-2 text-[12px] sm:grid-cols-[minmax(0,12rem)_minmax(2rem,1fr)_3.5rem]">
      <b className="truncate" title={`${endpoint.method} ${endpoint.path}`}>{resourceKind(endpoint.path)} · {readableFile(endpoint.path)}</b>
      <span className="h-2 rounded-full bg-white/45" aria-hidden="true"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, 100 * (endpoint.p95 ?? 0) / max)}%` }} /></span>
      <strong className="text-right tabular-nums">{timing(endpoint.p95)}</strong>
    </div>
    <p className="mt-1 text-[11.5px] text-muted-foreground">{endpoint.requests} recorded request{endpoint.requests === 1 ? "" : "s"}{endpoint.errors ? ` · ${endpoint.errors} HTTP error${endpoint.errors === 1 ? "" : "s"}` : ""}{endpoint.requests < 5 ? " · small sample" : ""}</p>
    <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Path and timings</summary><p className="mt-1 break-all font-mono">{endpoint.method} {endpoint.path}</p><p>Middle response: {timing(endpoint.p50)} · p95: {timing(endpoint.p95)}</p></details>
  </div>
}

function Waterfall({ waterfall }: { waterfall: NonNullable<LiveNetwork["waterfall"]> }) {
  const end = Math.max(1, ...waterfall.requests.map((request) => request.t + (request.ms ?? 0)))
  return <div className="grid gap-2 text-[11px]">
    {waterfall.requests.map((request, i) => <div key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(3rem,1fr)_4.5rem]">
      <span className="truncate font-mono" title={`${request.method} ${request.path}`}>{readableFile(request.path)}</span>
      <span className="relative h-2.5 rounded-full bg-white/40" aria-hidden="true"><span className={cn("absolute top-0 h-full min-w-1 rounded-full", request.status == null || request.status <= 0 ? "bg-human" : request.status >= 400 ? "bg-bad" : request.method === "POST" ? "bg-ai" : "bg-det")} style={{ left: `${100 * request.t / end}%`, width: `${100 * (request.ms ?? 0) / end}%` }} /></span>
      <span className="text-right tabular-nums text-muted-foreground">{timing(request.ms ?? null)}</span>
    </div>)}
  </div>
}

export function LiveNetworkView({ data: initial, graphs: initialGraphs = [] }: { data: LiveNetwork; graphs?: (NetworkGraph | null)[] }) {
  const [picked, setPicked] = useState<{ base: LiveNetwork; data: LiveNetwork; graphs: (NetworkGraph | null)[] } | null>(null)
  const [error, setError] = useState("")
  const [pathQuery, setPathQuery] = useState("")
  const run = useLive((state) => state.scope)
  const current = picked?.base === initial ? picked : null
  const data = current?.data ?? initial
  const graphs = current?.graphs ?? initialGraphs

  const selectCase = async (selected: string) => {
    try {
      const query = new URLSearchParams()
      if (run) query.set("run", run)
      if (selected) query.set("case", selected)
      const next = await api<LiveNetwork>(`/api/insights/network?${query}`)
      const nextGraphs = run ? await Promise.all(["service", "api"].map((name) => api<NetworkGraph>(`/api/runs/${encodeURIComponent(run)}/diagrams/${name}${selected ? `?case=${encodeURIComponent(selected)}` : ""}`))) : graphs
      setPicked({ base: initial, data: next, graphs: nextGraphs })
      setError("")
    } catch (cause) { setError((cause as Error).message) }
  }

  const codes = Object.entries(data.statusCodes)
  const unknown = codes.filter(([code]) => !/^[1-5]xx$/.test(code)).reduce((count, [, value]) => count + value, 0)
  const statusRows: [string, number, MeterTone][] = [
    ...codes.filter(([code]) => /^[1-5]xx$/.test(code)).map(([code, count]): [string, number, MeterTone] => [statusName(code), count, statusTone(code)]),
    ...(unknown ? [["Status unavailable", unknown, "human"] as [string, number, MeterTone]] : []),
  ]
  const httpErrors = data.totals.errors
  const slow = [...data.endpoints].filter((endpoint) => endpoint.p95 != null).sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 8)
  const maxP95 = Math.max(1, ...slow.map((endpoint) => endpoint.p95 ?? 0))
  const problemEndpoints = data.endpoints.filter((endpoint) => endpoint.errors || endpoint.duplicatePosts)
  const artifacts = data.artifacts.filter((item) => item.har || item.trace)
  const shownEndpoints = data.endpoints.filter((endpoint) => `${endpoint.method} ${endpoint.path} ${readableFile(endpoint.path)}`.toLowerCase().includes(pathQuery.trim().toLowerCase()))

  return <div className="grid gap-3.5">
    <PageHeader title="Network & traces" />
    <label className="text-[12px] font-medium">Browser journey <select className="glass-inset ml-2 rounded-lg px-2 py-1" value={data.selectedCase ?? ""} onChange={(event) => void selectCase(event.target.value)}><option value="">All journeys</option>{data.cases.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}

    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{data.files ? `${data.totals.requests.toLocaleString()} requests across ${data.files} captured journey${data.files === 1 ? "" : "s"}` : "No network traffic captured yet"}</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{data.files ? httpErrors ? `${httpErrors} HTTP error responses (4xx/5xx).` : "No HTTP error responses (4xx/5xx) recorded." : "Run browser checks to capture traffic."}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]"><span><b>{unknown}</b> statuses unavailable</span><span><b>{data.totals.duplicatePosts}</b> repeated POSTs</span><span><b>{data.endpoints.length}</b> paths and methods</span></div>
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title="Needs review">
        <div className="divide-y divide-border">
          {problemEndpoints.map((endpoint) => <div key={`${endpoint.method}:${endpoint.path}`} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-2"><Pill tone="bad">Review</Pill><b className="text-[13px]">{endpoint.method} {endpoint.path}</b></div>
            <p className="mt-1 text-[12px] text-muted-foreground">{endpoint.errors ? `${endpoint.errors} HTTP error response${endpoint.errors === 1 ? "" : "s"}. ` : ""}{endpoint.duplicatePosts ? `${endpoint.duplicatePosts} POST request${endpoint.duplicatePosts === 1 ? " was" : "s were"} repeated within two seconds.` : ""}</p>
          </div>)}
          {unknown > 0 && <div className="py-3 first:pt-0"><p className="text-[13px] font-semibold">{unknown} requests have no usable HTTP status</p><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">The capture cannot tell whether these were cancelled, blocked, or otherwise incomplete. Check the saved HAR and browser trace for the affected journey.</p></div>}
          {!problemEndpoints.length && !unknown && <p className="text-[13px] text-muted-foreground">No HTTP errors, repeated POSTs, or unknown statuses were recorded.</p>}
        </div>
      </ScrollCard>

      <ScrollCard title="Response status mix">
        {statusRows.length ? <><HBars rows={statusRows} /><p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">2xx: success · 4xx/5xx: HTTP error · unavailable: no usable response code.</p></> : <p className="text-[13px] text-muted-foreground">No response statuses were captured.</p>}
      </ScrollCard>

      <ScrollCard title="Slowest paths">
        {slow.length ? <><p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">p95 is near the slow end of recorded responses for a path. With one or two requests it mostly reflects that small sample.</p><div className="divide-y divide-border">{slow.map((endpoint) => <RequestBar key={`${endpoint.method}:${endpoint.path}`} endpoint={endpoint} max={maxP95} />)}</div></> : <p className="text-[13px] text-muted-foreground">No request durations were captured.</p>}
      </ScrollCard>

      <ScrollCard title={`All paths · ${data.endpoints.length}`}>
        <input aria-label="Filter captured paths" value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Find a path or file..." className="glass-inset mb-2 w-full rounded-lg px-3 py-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        {shownEndpoints.length ? <div className="divide-y divide-border">{shownEndpoints.map((endpoint) => <details key={`${endpoint.method}:${endpoint.path}`} className="py-2.5 first:pt-0">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-[12.5px]"><span className="min-w-0 truncate" title={endpoint.path}><b>{readableFile(endpoint.path)}</b><span className="ml-1 text-muted-foreground">{endpoint.method}</span></span><span className="shrink-0 text-muted-foreground">{endpoint.requests} requests</span></summary>
          <div className="mt-2 grid gap-1 text-[11.5px] text-muted-foreground"><p className="break-all font-mono">{endpoint.method} {endpoint.path}</p><p>Middle response: {timing(endpoint.p50)} · p95: {timing(endpoint.p95)}</p><p>{endpoint.errors} HTTP errors · {endpoint.duplicatePosts} repeated POSTs</p></div>
        </details>)}</div> : <p className="text-[13px] text-muted-foreground">{data.endpoints.length ? "No captured path matches that search." : "No paths were captured."}</p>}
      </ScrollCard>

      <ScrollCard title={`HAR files and traces · ${artifacts.length}`}>
        {artifacts.length ? <div className="divide-y divide-border">{artifacts.map((item) => <div key={item.case} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 text-[12px]"><b className="font-mono">{item.case}</b><span className="flex flex-wrap gap-3 font-semibold text-brand">{item.har && <a href={API_URL + item.har} download className="hover:underline">Download HAR</a>}{item.trace && <a href={`${API_URL}/trace/index.html?trace=${encodeURIComponent(API_URL + item.trace)}`} target="_blank" rel="noreferrer" className="hover:underline">Open trace</a>}{item.trace && <a href={API_URL + item.trace} download className="hover:underline">Download trace</a>}</span></div>)}</div> : <p className="text-[13px] text-muted-foreground">No HAR or browser trace was saved for this selection.</p>}
      </ScrollCard>

      {data.waterfall && <ScrollCard title={`Request waterfall · ${data.waterfall.case}`} caption="Start position and duration; red is an HTTP error, gray has no status" size="diagram"><Waterfall waterfall={data.waterfall} /></ScrollCard>}
    </div>

    {graphs.some((graph) => graph?.nodes.length) && <section aria-label="Network diagrams" className="grid gap-3.5">{graphs.map((graph, i) => graph?.nodes.length ? <ScrollCard key={i} title={i === 0 ? "Service map" : "API call graph"} size="diagram"><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={i === 0 ? "Service map" : "API call graph"} /></ScrollCard> : null)}</section>}
  </div>
}
