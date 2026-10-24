"use client"
// Repair and regression loop for one finding (blueprint Step 6): propose a patch, review the diff guard,
// approve it, and watch the regression run's before/after comparison.
import Link from "next/link"
import { Check, Wrench } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/kit/card"
import { Pill, type Tone } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { notify } from "@/lib/notify"

type Repair = {
  id: string; attempt: number; outcome: string; note: string | null
  patch: { summary?: string; diff?: string; note?: string; files?: string[] }
  guard: { flags: { code: string; level: string; message: string }[] }
  approval: { id: string; status: string } | null
  regression_run: string | null; regression_state: string | null
  comparison: { test_case_id: string; baseline: string; rerun: string; change: string }[]
}
const OUTCOME_TONE: Record<string, Tone> = { pending: "human", approved: "brand", verified: "ok", failed: "bad", rejected: "mut", escalated: "bad" }
const CHANGE_TONE: Record<string, Tone> = { fixed: "ok", unchanged_pass: "mut", still_failing: "bad", new_failure: "bad", inconclusive: "warn" }
const LIVE = ["pending", "approved"]

export function RepairPanel({ findingId, confirmed }: { findingId: string; confirmed: boolean }) {
  const [repairs, setRepairs] = useState<Repair[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api<{ items: Repair[] }>(`/api/repairs?finding=${findingId}`).then((r) => setRepairs(r.items)).catch(() => setRepairs([])), [findingId])
  const r = repairs?.[0]
  const running = r?.outcome === "approved"

  useEffect(() => { load() }, [load])
  useEffect(() => { // poll while the regression run is in flight
    if (!running) return
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [running, load])

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try { await fn(); notify(done); await load() } catch (e) { notify((e as Error).message, "bad") } finally { setBusy(false) }
  }
  const canPropose = confirmed && (!r || !LIVE.includes(r.outcome)) && r?.outcome !== "verified" && (repairs?.length ?? 0) < 3

  return (
    <Card title="Repair and regression" caption={r ? `${r.id} · attempt ${r.attempt} of 3` : "Propose a fix, approve it, prove it"}>
      {!r && <p className="text-[13px] text-muted-foreground">{confirmed ? "No repair yet." : "Only confirmed findings can be repaired."}</p>}
      {r && (
        <div className="grid gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={OUTCOME_TONE[r.outcome] ?? "mut"}>{r.outcome}</Pill>
            {r.approval && <Pill tone="human">{r.approval.id} · {r.approval.status}</Pill>}
            {r.regression_run && <Link href={`/runs/live?run=${r.regression_run}`}><Pill tone="brand">{r.regression_run} · {r.regression_state}</Pill></Link>}
          </div>
          {r.patch.summary && <p><b>Patch:</b> {r.patch.summary}</p>}
          {r.guard.flags.map((g) => <p key={g.code} className="text-bad">{g.message}</p>)}
          {r.patch.diff && <pre className="glass-inset max-h-56 overflow-auto rounded-lg p-3 font-mono text-[11.5px] whitespace-pre">{r.patch.diff}</pre>}
          {r.patch.note && <p className="text-xs text-muted-foreground">{r.patch.note}</p>}
          {!!r.comparison.length && (
            <div className="grid gap-1">
              <b>Before → after</b>
              {r.comparison.map((c) => (
                <div key={c.test_case_id} className="flex items-center justify-between gap-2 font-mono text-[12px]">
                  <span>{c.test_case_id}: {c.baseline} → {c.rerun}</span><Pill tone={CHANGE_TONE[c.change] ?? "mut"}>{c.change}</Pill>
                </div>))}
            </div>)}
          {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
          {running && <p className="text-xs text-muted-foreground">Regression running…</p>}
        </div>)}
      <div className="mt-3 flex flex-wrap gap-2">
        {r?.outcome === "pending" && (
          <Button variant="brand" size="pill" disabled={busy} onClick={() => act(() => api(`/api/repairs/${r.id}/verify`, { method: "POST" }), "Patch approved. Regression started.")}>
            <Check />Approve patch and run regression</Button>)}
        {canPropose && (
          <Button variant={r ? "glass" : "brand"} size="pill" disabled={busy} onClick={() => act(() => api(`/api/findings/${findingId}/repair-proposals`, { method: "POST" }), "Patch proposed. Waiting for approval.")}>
            <Wrench />{r ? "Try another fix" : "Propose fix"}</Button>)}
      </div>
    </Card>
  )
}
