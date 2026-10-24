"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, type Tone } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api, API_URL, type ApiEvent, type ApiRun, type Items } from "@/lib/api"
import { useLive } from "@/lib/live"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { GraphMap, LanesPanel, ScreenshotStrip, useRunGraph } from "./run-graph"

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"])
const active = (r: ApiRun) => !TERMINAL.has(r.state)
const STATUS_TONE: Record<string, Tone> = { ok: "ok", failed: "bad", warn: "warn", inconclusive: "warn", waiting: "human", skipped: "mut" }
const ACTOR_TONE: Record<string, Tone> = { ai: "ai", det: "det", human: "human" }

/** The tab discovers all running processes; a query parameter pins one stable run UUID. */
export function LiveRunsPanel({ runId }: { runId?: string }) {
  const [runs, setRuns] = useState<ApiRun[]>([])
  const [error, setError] = useState("")
  const scope = useLive((s) => s.scope) // the run picker's choice is the default selection
  const [autoSelected, setAutoSelected] = useState<string>()
  useEffect(() => {
    let mounted = true
    const refresh = () => api<Items<ApiRun>>("/api/runs?limit=100")
      .then(({ items }) => {
        if (mounted) {
          setRuns(items)
          setAutoSelected((current) => current ?? (items.find(active) ?? items[0])?.uuid)
          setError("")
        }
      })
      .catch((e: Error) => { if (mounted) setError(e.message) })
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 3000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])
  const selected = runId ? runs.find((r) => r.uuid === runId || r.id === runId)
    : runs.find((r) => r.uuid === scope) ?? runs.find((r) => r.uuid === autoSelected) ?? runs.find(active) ?? runs[0]
  const selectedId = selected?.uuid ?? runId
  return <div className="grid gap-4">
    <Card title={`Live runs · ${runs.filter(active).length} active`} caption="Each run has its own event stream and progress">
      {error && <p role="alert" className="mb-2 text-sm text-bad">Could not refresh runs: {error}</p>}
      <div className="flex flex-wrap gap-2">
        {runs.map((r) => <Link key={r.uuid} href={`/runs/live?run=${encodeURIComponent(r.uuid)}`}
          aria-current={selectedId === r.uuid ? "page" : undefined}
          className={cn("rounded-xl border px-3 py-2 text-sm hover:bg-white/40", selectedId === r.uuid && "border-brand bg-white/40")}>
          <span className="font-mono text-xs">{r.id}</span> · {r.name}
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{r.uuid.slice(0, 8)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{r.state}</span>
        </Link>)}
        {!runs.length && !error && <span className="text-sm text-muted-foreground">No runs yet. Start one to watch it here.</span>}
      </div>
      <Link href="/runs/new" className="mt-3 inline-block text-sm underline">New test run</Link>
    </Card>
    {selectedId && <RealRunView key={selectedId} runId={selectedId} />}
  </div>
}

export function RealRunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<ApiRun | null>(null)
  const [events, setEvents] = useState<ApiEvent[]>([])
  const [decided, setDecided] = useState<Record<string, boolean>>({})
  const [conn, setConn] = useState<"connecting" | "open" | "reconnecting" | "closed">("connecting")
  const [error, setError] = useState("")
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true, finished = false, seen = 0, failures = 0
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let refreshTimer: ReturnType<typeof setInterval> | null = null
    const refresh = () => api<ApiRun>(`/api/runs/${encodeURIComponent(runId)}`).then((r) => {
      if (mounted) setRun(r)
      return r
    })
    const receive = (e: ApiEvent) => {
      seen = Math.max(seen, e.seq)
      if (mounted) setEvents((xs) => xs.some((x) => x.seq === e.seq) ? xs : [...xs, e].sort((a, b) => a.seq - b.seq))
      if (e.event_type === "state" || e.event_type === "verdict") void refresh().catch(() => {})
      if (e.event_type === "state" && TERMINAL.has(String(e.data.to))) {
        finished = true
        source?.close()
        if (mounted) setConn("closed")
      }
    }
    const connect = async () => {
      if (!mounted || finished) return
      try {
        // Native EventSource has no Authorization header; renew its short-lived ticket on every reconnect.
        const { ticket } = await api<{ ticket: string }>("/api/sse-ticket", { method: "POST" })
        if (!mounted || finished) return
        source = new EventSource(`${API_URL}/api/runs/${encodeURIComponent(runId)}/events/stream?after_seq=${seen}&ticket=${encodeURIComponent(ticket)}`)
        source.onopen = () => { failures = 0; if (mounted) setConn("open") }
        source.onerror = () => {
          source?.close()
          if (!mounted || finished) return
          setConn("reconnecting")
          retry = setTimeout(() => { void connect() }, Math.min(1000 * 2 ** failures++, 10000))
        }
        source.addEventListener("run_event", (m) => {
          try { receive(JSON.parse((m as MessageEvent).data) as ApiEvent) }
          catch { if (mounted) setError("A run event could not be read.") }
        })
      } catch (e) {
        if (!mounted) return
        setError((e as Error).message)
        setConn("reconnecting")
        retry = setTimeout(() => { void connect() }, Math.min(1000 * 2 ** failures++, 10000))
      }
    }
    const start = async () => {
      try {
        const [, backlog] = await Promise.all([
          refresh(), api<Items<ApiEvent>>(`/api/runs/${encodeURIComponent(runId)}/events`),
        ])
        if (!mounted) return
        setEvents(backlog.items)
        seen = backlog.items.at(-1)?.seq ?? 0
        finished = backlog.items.some((e) => e.event_type === "state" && TERMINAL.has(String(e.data.to)))
        if (!finished) void connect()
        else setConn("closed")
        refreshTimer = setInterval(() => { if (!document.hidden) void refresh().catch(() => {}) }, 3000)
      } catch (e) { if (mounted) { setError((e as Error).message); setConn("closed") } }
    }
    void start()
    return () => {
      mounted = false
      source?.close()
      if (retry) clearTimeout(retry)
      if (refreshTimer) clearInterval(refreshTimer)
    }
  }, [runId])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [events.length])
  const decide = async (approvalId: string, approve: boolean) => {
    try {
      await api(`/api/approvals/${approvalId}/decision`, { json: { approve, reason: approve ? "approved from live run" : "rejected from live run" } })
      setDecided((d) => ({ ...d, [approvalId]: approve }))
      notify(approve ? "Approved. The run continues." : "Rejected. That test is skipped.", approve ? "ok" : "warn")
    } catch (err) { notify((err as Error).message, "bad") }
  }
  const live = run && active(run)
  const liveCounts = { passed: 0, failed: 0, inconclusive: 0 }
  for (const e of events.filter((x) => x.event_type === "verdict")) {
    liveCounts[e.status === "ok" ? "passed" : e.status === "inconclusive" ? "inconclusive" : "failed"]++
  }
  const counts = live ? liveCounts : run?.counts ?? liveCounts
  const findings = events.filter((e) => e.event_type === "finding")
  const lastGate = [...events].reverse().find((e) => e.event_type === "gate")
  const graph = useRunGraph(runId, events)
  const logEvents = events.filter((e) => e.event_type !== "node") // node phases are drawn on the graph map instead
  return <div className="grid gap-4">
    <PageHeader eyebrow="Live run · real execution" title={`${run?.id ?? runId} · ${run?.name ?? "Loading…"}`}>
      <Pill tone={conn === "open" ? "ok" : "mut"} dot pulse={conn === "open" && !!live}>{live ? conn : run ? "Finished" : conn}</Pill>
      {run && <Pill tone={live ? "brand" : run.status === "passed" ? "ok" : run.status === "failed" ? "bad" : "warn"}>{run.state}</Pill>}
      {live && <Button variant="glass" size="pill" onClick={() => api(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }).then(() => notify("Cancel requested", "warn")).catch((e: Error) => notify(e.message, "bad"))}>Stop run</Button>}
    </PageHeader>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <GraphMap graph={graph} />
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card title="Run log" caption={`${logEvents.length} events · persisted, append-only`} flush>
        <div ref={logRef} aria-live="polite" className="max-h-[560px] overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
          {logEvents.map((e) => {
            const apId = e.event_type === "gate" ? String(e.data.approval_id ?? "") : ""
            const canDecide = !!apId && run?.state === "AWAITING_APPROVAL" && lastGate?.seq === e.seq
            return <div key={e.seq} className="flex flex-wrap items-baseline gap-2 border-b border-white/30 py-1">
              <span className="w-7 shrink-0 text-right text-muted-foreground">{e.seq}</span>
              <Pill tone={ACTOR_TONE[e.actor] ?? "mut"}>{e.actor.toUpperCase()}</Pill>
              <span className="text-muted-foreground">{e.event_type}</span>
              <span className={cn("min-w-0 flex-1 break-words", e.status === "failed" && "text-bad")}>{e.summary}</span>
              {e.status && <Pill tone={STATUS_TONE[e.status] ?? "mut"}>{e.status}</Pill>}
              {canDecide && (apId in decided ? <Pill tone={decided[apId] ? "ok" : "warn"}>{decided[apId] ? "Approved" : "Rejected"}</Pill> : <span className="flex gap-1.5">
                <Button variant="brand" size="pill" onClick={() => decide(apId, true)}><Check />Approve</Button>
                <Button variant="glass" size="pill" onClick={() => decide(apId, false)}><X />Reject</Button>
              </span>)}
            </div>
          })}
          {!events.length && <p className="py-6 text-center text-muted-foreground">Waiting for the first event…</p>}
        </div>
      </Card>
      <div className="grid content-start gap-4">
        <Card title="Current activity">
          <p className="font-mono text-xs text-muted-foreground">{run?.state ?? "Loading run"}</p>
          <p className="mt-2 break-words text-sm">{events.at(-1)?.summary ?? "Waiting for the worker to start"}</p>
          <p className="mt-2 text-xs text-muted-foreground">{events.filter((e) => e.event_type === "step").length} browser steps · {events.filter((e) => e.event_type === "verdict").length} cases verified</p>
        </Card>
        <Card title="Progress">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(["passed", "failed", "inconclusive"] as const).map((k) => <div key={k} className="glass-inset rounded-xl p-3">
              <dd className={cn("text-2xl font-semibold tabular-nums", k === "failed" && "text-bad", k === "passed" && "text-ok")}>{counts[k] ?? 0}</dd>
              <dt className="text-xs text-muted-foreground capitalize">{k}</dt>
            </div>)}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{run ? `${events.filter((e) => e.event_type === "verdict").length} of ${run.total} cases verified · ${run.duration}` : ""}</p>
        </Card>
        <LanesPanel graph={graph} />
        <Card title="Findings from this run">
          {findings.length ? findings.map((f) => <Link key={f.seq} href={`/findings/${f.summary.split(":")[0]}`} className="block py-1.5 text-[13px] hover:underline">{f.summary}</Link>)
            : <p className="text-[13px] text-muted-foreground">None yet. Findings appear after verification.</p>}
        </Card>
      </div>
    </div>
    <ScreenshotStrip events={events} />
  </div>
}
