"use client"
// Live run fed by the real SSE stream (GET /api/runs/{id}/events/stream). Gates pause the run until approved here.
import Link from "next/link"
import { Check, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, type Tone } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api, API_URL, type ApiEvent, type ApiRun } from "@/lib/api"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const STATUS_TONE: Record<string, Tone> = { ok: "ok", failed: "bad", warn: "warn", inconclusive: "warn", waiting: "human", skipped: "mut" }
const ACTOR_TONE: Record<string, Tone> = { ai: "ai", det: "det", human: "human" }
const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"]

export function RealRunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<ApiRun | null>(null)
  const [events, setEvents] = useState<ApiEvent[]>([])
  const [decided, setDecided] = useState<Record<string, boolean>>({})
  const [conn, setConn] = useState<"connecting" | "open" | "closed">("connecting")
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => api<ApiRun>(`/api/runs/${runId}`).then(setRun).catch(() => {})
    refresh()
    const es = new EventSource(`${API_URL}/api/runs/${runId}/events/stream`)
    es.onopen = () => setConn("open")
    es.onerror = () => setConn("closed") // EventSource retries on its own and resumes from Last-Event-ID
    es.addEventListener("run_event", (m) => {
      const e = JSON.parse((m as MessageEvent).data) as ApiEvent
      setEvents((xs) => (xs.some((x) => x.seq === e.seq) ? xs : [...xs, e]))
      if (e.event_type === "state" || e.event_type === "verdict") refresh()
      if (e.event_type === "state" && TERMINAL.includes(String(e.data.to))) es.close()
    })
    return () => es.close()
  }, [runId])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [events.length])

  const decide = async (approvalId: string, approve: boolean) => {
    try {
      await api(`/api/approvals/${approvalId}/decision`, { json: { approve, reason: approve ? "approved from live run" : "rejected from live run" } })
      setDecided((d) => ({ ...d, [approvalId]: approve }))
      notify(approve ? "Approved. The run continues." : "Rejected. That test is skipped.", approve ? "ok" : "warn")
    } catch (err) { notify((err as Error).message, "bad") }
  }

  const findings = events.filter((e) => e.event_type === "finding")
  const live = run && !TERMINAL.includes(run.state)
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Live run · real execution" title={`${run?.id ?? runId} · ${run?.name ?? "Loading…"}`}>
          <Pill tone={conn === "open" ? "ok" : "mut"} dot pulse={conn === "open" && !!live}>{conn === "open" ? "Streaming" : conn}</Pill>
          {run && <Pill tone={live ? "brand" : run.status === "passed" ? "ok" : run.status === "failed" ? "bad" : "warn"}>{run.state}</Pill>}
          {live && <Button variant="glass" size="pill" onClick={() => api(`/api/runs/${runId}/cancel`, { method: "POST" }).then(() => notify("Cancel requested", "warn"))}>Stop run</Button>}
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Run log" caption={`${events.length} events · persisted, append-only`} flush>
          <div ref={logRef} className="max-h-[560px] overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
            {events.map((e) => {
              const apId = e.event_type === "gate" ? String(e.data.approval_id ?? "") : ""
              return (
                <div key={e.seq} className="flex flex-wrap items-baseline gap-2 border-b border-white/30 py-1">
                  <span className="w-7 shrink-0 text-right text-muted-foreground">{e.seq}</span>
                  <Pill tone={ACTOR_TONE[e.actor] ?? "mut"}>{e.actor.toUpperCase()}</Pill>
                  <span className="text-muted-foreground">{e.event_type}</span>
                  <span className={cn("min-w-0 flex-1 break-words", e.status === "failed" && "text-bad")}>{e.summary}</span>
                  {e.status && <Pill tone={STATUS_TONE[e.status] ?? "mut"}>{e.status}</Pill>}
                  {apId && (apId in decided ? <Pill tone={decided[apId] ? "ok" : "warn"}>{decided[apId] ? "Approved" : "Rejected"}</Pill> : (
                    <span className="flex gap-1.5">
                      <Button variant="brand" size="pill" onClick={() => decide(apId, true)}><Check />Approve</Button>
                      <Button variant="glass" size="pill" onClick={() => decide(apId, false)}><X />Reject</Button>
                    </span>))}
                </div>)
            })}
            {!events.length && <p className="py-6 text-center text-muted-foreground">Waiting for the first event…</p>}
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card title="Progress">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(["passed", "failed", "inconclusive"] as const).map((k) => (
                <div key={k} className="glass-inset rounded-xl p-3">
                  <dd className={cn("text-2xl font-semibold tabular-nums", k === "failed" && "text-bad", k === "passed" && "text-ok")}>{run?.counts[k] ?? 0}</dd>
                  <dt className="text-xs text-muted-foreground capitalize">{k}</dt>
                </div>))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{run ? `${run.total} test cases · ${run.duration}` : ""}</p>
          </Card>
          <Card title="Findings from this run">
            {findings.length ? findings.map((f) => {
              const id = f.summary.split(":")[0]
              return <Link key={f.seq} href={`/findings/${id}`} className="block py-1.5 text-[13px] hover:underline">{f.summary}</Link>
            }) : <p className="text-[13px] text-muted-foreground">None yet. Findings appear after verification.</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
