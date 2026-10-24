"use client"
// Live graph map, lanes and screenshots for one run (PLAN_MODES §6). The topology and node phases come from
// GET /api/runs/{id}/graph; it is refetched whenever the run streams a `node` or `lane` event.
import { useEffect, useState } from "react"
import { Card } from "@/components/kit/card"
import { Pill, type Tone } from "@/components/kit/pills"
import { api, API_URL, type ApiEvent } from "@/lib/api"
import { accessToken } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Status = "pending" | "running" | "waiting" | "done" | "failed"
type Progress = { done: number; total: number; status: string | null; note: string } | null
type GraphNode = {
  id: string; label: string; status: Status; kind?: string
  children?: { id: string; label: string; status: Status }[]
  lanes?: { id: string; lane: string; label: string; status: Status; progress: Progress }[]
}
export type Graph = { run: string; state: string; mode: string; nodes: GraphNode[] }

const TONE: Record<Status, Tone> = { pending: "mut", running: "brand", waiting: "human", done: "ok", failed: "bad" }
const RING: Record<Status, string> = {
  pending: "border-white/50 text-muted-foreground", running: "border-brand bg-brand/10 animate-pulse",
  waiting: "border-human bg-human/10", done: "border-ok/60 bg-ok/10", failed: "border-bad bg-bad/10",
}

function Box({ label, status, small }: { label: string; status: Status; small?: boolean }) {
  return <div className={cn("rounded-xl border px-3 py-2 text-center", small ? "text-[11px]" : "text-[13px] font-medium", RING[status])}>
    {label}
    {!small && <div className="mt-1"><Pill tone={TONE[status]}>{status}</Pill></div>}
  </div>
}

export function useRunGraph(runId: string, events: ApiEvent[]) {
  const [graph, setGraph] = useState<Graph | null>(null)
  const ticks = events.filter((e) => e.event_type === "node" || e.event_type === "lane" || e.event_type === "state").length
  useEffect(() => {
    let mounted = true
    const t = setTimeout(() => {
      api<Graph>(`/api/runs/${encodeURIComponent(runId)}/graph`).then((g) => { if (mounted) setGraph(g) }).catch(() => {})
    }, ticks ? 300 : 0)
    return () => { mounted = false; clearTimeout(t) }
  }, [runId, ticks])
  return graph
}

export function GraphMap({ graph, title = "Pipeline", extra }: { graph: Graph | null; title?: React.ReactNode; extra?: React.ReactNode }) {
  if (!graph) return <Card title={title} extra={extra}><p className="text-sm text-muted-foreground">Loading graph…</p></Card>
  return <Card title={title} extra={extra} caption={`LangGraph · ${graph.mode.replace("_", " ")} · subgraphs and parallel lanes`}>
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Run pipeline">
      {graph.nodes.map((n, i) => <li key={n.id} className="flex items-stretch gap-2">
        <div className="grid min-w-[96px] content-start gap-1.5">
          <Box label={n.label} status={n.status} />
          {n.children?.map((c) => <Box key={c.id} small label={c.label} status={c.status} />)}
          {n.lanes?.map((l) => <Box key={l.id} small label={`⇉ ${l.label}`} status={l.status} />)}
        </div>
        {i < graph.nodes.length - 1 && <span aria-hidden className="self-start pt-3 text-muted-foreground">→</span>}
      </li>)}
    </ol>
  </Card>
}

export function LanesPanel({ graph }: { graph: Graph | null }) {
  const lanes = graph?.nodes.find((n) => n.lanes)?.lanes ?? []
  return <Card title="Lanes" caption="Run in parallel after the gate">
    <ul className="grid gap-3">
      {lanes.map((l) => {
        const p = l.progress, pct = p && p.total ? Math.round((100 * p.done) / p.total) : 0
        return <li key={l.id}>
          <div className="flex items-center justify-between text-[13px]">
            <span>{l.label}</span>
            <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">{p ? `${p.done}/${p.total}` : "—"}<Pill tone={TONE[l.status]}>{l.status}</Pill></span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/40" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={l.label}>
            <div className={cn("h-full rounded-full transition-all", l.status === "failed" ? "bg-bad" : "bg-brand")} style={{ width: `${pct}%` }} />
          </div>
          {p?.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
        </li>
      })}
      {!lanes.length && <li className="text-sm text-muted-foreground">No lanes yet.</li>}
    </ul>
  </Card>
}

/** Evidence needs the bearer token, so images load through fetch into object URLs. */
function EvidenceImage({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let url: string | undefined, mounted = true
    void (async () => {
      const token = await accessToken()
      const res = await fetch(`${API_URL}/api/evidence/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok || !mounted) return
      url = URL.createObjectURL(await res.blob())
      setSrc(url)
    })().catch(() => {})
    return () => { mounted = false; if (url) URL.revokeObjectURL(url) }
  }, [id])
  // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, next/image cannot optimise it
  return src ? <img src={src} alt={alt} className="h-28 w-auto rounded-lg border border-white/50 object-cover" />
    : <div className="h-28 w-44 animate-pulse rounded-lg bg-white/40" aria-label={`${alt} loading`} />
}

export function ScreenshotStrip({ events }: { events: ApiEvent[] }) {
  const shots = events.filter((e) => e.event_type === "screenshot" && e.data.evidence_id)
  return <Card title="Screenshots" caption="Latest frame after each test case">
    {shots.length ? <div className="flex gap-3 overflow-x-auto pb-1">
      {shots.map((e) => <figure key={e.seq} className="shrink-0">
        <EvidenceImage id={String(e.data.evidence_id)} alt={`Screenshot ${e.summary}`} />
        <figcaption className="mt-1 max-w-44 truncate font-mono text-[11px] text-muted-foreground">{e.summary}</figcaption>
      </figure>)}
    </div> : <p className="text-[13px] text-muted-foreground">Screenshots appear as each test case finishes.</p>}
  </Card>
}
