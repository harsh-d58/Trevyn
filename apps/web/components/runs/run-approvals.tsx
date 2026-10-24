"use client"
// Human in the loop on the live run page: every approval tied to this run (high-risk gates and reviews of uncertain
// findings), refreshed as the run logs. Pending ones can be decided here.
import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"
import { Card } from "@/components/kit/card"
import { Pill } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api, type ApiEvent, type Items } from "@/lib/api"
import { notify } from "@/lib/notify"

type RunApproval = { id: string; title: string; why: string; category: string; status: string; risk: string }
const TONE = { approved: "ok", rejected: "warn", pending: "human" } as const

export function RunApprovals({ runId, events }: { runId: string; events: ApiEvent[] }) {
  const [items, setItems] = useState<RunApproval[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  // refetch when the run logs something that can open or settle an approval
  const ticks = events.filter((e) => ["gate", "finding", "verdict", "state"].includes(e.event_type)).length
  const load = () => api<Items<RunApproval>>(`/api/approvals?status=all&run=${encodeURIComponent(runId)}`).then((r) => setItems(r.items))
  useEffect(() => {
    let mounted = true
    const t = setTimeout(() => {
      api<Items<RunApproval>>(`/api/approvals?status=all&run=${encodeURIComponent(runId)}`)
        .then((r) => { if (mounted) setItems(r.items) }).catch(() => {})
    }, ticks ? 400 : 0)
    return () => { mounted = false; clearTimeout(t) }
  }, [runId, ticks])
  const decide = async (a: RunApproval, approve: boolean) => {
    setBusy(a.id)
    try {
      await api(`/api/approvals/${encodeURIComponent(a.id)}/decision`, { json: { approve, reason: approve ? "approved from live run" : "rejected from live run" } })
      notify(approve ? `${a.id} approved` : `${a.id} rejected`, approve ? "ok" : "warn")
      await load()
    } catch (e) { notify((e as Error).message, "bad") } finally { setBusy(null) }
  }
  const pending = items.filter((a) => a.status === "pending").length
  return <Card title={`Approvals for this run${pending ? ` · ${pending} waiting` : ""}`} caption="High-risk tests and uncertain findings a person decides">
    {items.length ? <ul className="grid gap-2">
      {items.map((a) => <li key={a.id} className="rounded-xl border border-white/50 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{a.title}</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{a.category} · {a.why}</div>
          </div>
          <Pill tone={TONE[a.status as keyof typeof TONE] ?? "mut"}>{a.status}</Pill>
        </div>
        {a.status === "pending" && <div className="mt-2 flex gap-1.5">
          <Button variant="brand" size="pill-sm" disabled={busy === a.id} onClick={() => decide(a, true)}><Check />Approve</Button>
          <Button variant="glass" size="pill-sm" disabled={busy === a.id} onClick={() => decide(a, false)}><X />Reject</Button>
        </div>}
      </li>)}
    </ul> : <p className="text-[13px] text-muted-foreground">No approvals for this run. High-risk tests and uncertain findings appear here.</p>}
  </Card>
}
