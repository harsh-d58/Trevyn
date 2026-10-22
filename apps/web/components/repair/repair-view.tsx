"use client"
// Repair assistant (PORTING_PLAN.md P1.8, from Repair.jsx Repair). Approving the patch goes through the
// store (approveRepair ⇄ AP-31), so the Board, Approvals, Overview queue and Regression page update too.
import Link from "next/link"
import { motion } from "motion/react"
import { Check, Copy, Lock } from "lucide-react"
import { useState } from "react"
import { FlowMap } from "@/components/charts/flow-map"
import { PairBars } from "@/components/charts/progress"
import { Card, StagePanel } from "@/components/kit/card"
import { GlassDialog } from "@/components/kit/glass-dialog"
import { CheckLine, Meter } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { MonoLabel, Pill } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { getRepair } from "@/lib/data"
import { rcGraph } from "@/lib/demo/repair"
import { useLive, useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Repair = Awaited<ReturnType<typeof getRepair>>

export function RepairView({ data }: { data: Repair }) {
  const store = useLiveStore()
  const patch = useLive((s) => s.repair)
  const [rc, setRc] = useState(false)
  const [sel, setSel] = useState("svc")
  const [note, setNote] = useState(data.changeRequest)
  const done = patch === "done"
  const graph = rcGraph(done)

  const copy = () => navigator.clipboard?.writeText(data.prompt).then(() => notify("Prompt copied"), () => notify("Copy blocked by the browser. Select the text instead.", "warn"))

  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Repair & regress" title="Repair assistant" sub="DEF-142 · Duplicate orders after checkout. Trevyn proposes a fix. A person accepts it. Regression proves it.">
        <Button variant="glass" size="pill" render={<Link href="/findings/DEF-142" />}>View finding</Button>
      </PageHeader>

      <StagePanel eyebrow="Root-cause propagation · DEF-142" title={done ? "The retry now replays the first order" : "One retry, two orders, two charges"}
        legend={[["#f27fae", "Defect path"], ["#f2b84b", "Patch awaiting approval"], ["#5cc8b2", "Verified path"]]}
        footer={
          <div className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-white/70 px-4 py-3 text-[12.5px]">
            <span className="font-mono text-brand">{data.rcInfo[sel][0]}</span>
            <motion.span key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 flex-1 text-foreground/80">{data.rcInfo[sel][1]}</motion.span>
            <span className="text-[11px] text-muted-foreground">Click a node</span>
          </div>
        }>
        <FlowMap pastel nodes={graph.nodes} edges={graph.edges} w={920} h={340} nw={172} sel={sel} onSelect={setSel} label="Root-cause propagation" />
      </StagePanel>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-3.5">
          <Card flush>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-mono text-[13px] font-semibold">orders/service.py</h3>
              <span className="flex gap-1.5"><Pill tone="ok">+7</Pill><Pill tone="bad">−1</Pill></span>
            </div>
            <div className="overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.7]">
              {data.diff.map(([k, l], i) => <div key={i} className={cn("px-4 whitespace-pre", { a: "bg-ok/14", d: "bg-bad/13", h: "text-ai", "": "" }[k])}>{l}</div>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              {patch === "pending" && (
                <>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Lock size={13} />Policy: no fix passes until tests pass</span>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="glass" size="pill" onClick={() => setRc(true)}>Request changes</Button>
                    <Button variant="human" size="pill" onClick={() => store.approveRepair()}><Check />Approve patch &amp; rerun regression</Button>
                  </div>
                </>
              )}
              {patch === "running" && <span className="animate-pulse text-[13px] font-medium text-muted-foreground">Running regression suite on patched build…</span>}
              {done && <Pill tone="ok"><Check size={12} />Approved by Alex Chen · regression passed</Pill>}
            </div>
          </Card>

          <Card title="Before / after comparison"
            extra={done && <span className="flex gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-bad/70" />Before</span><span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-ok" />After</span></span>}>
            {done ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 md:grid-cols-[1fr_1.5fr]">
                <div>
                  <div className="grid grid-cols-2 gap-2.5 text-center">
                    <div className="rounded-2xl border border-bad/50 bg-bad/5 p-3"><div className="text-[11.5px] text-muted-foreground">Before patch</div><div className="text-[24px] font-light text-bad tabular">2 orders</div><div className="text-[11.5px] text-muted-foreground">CHECKOUT-014 failed 3/3</div></div>
                    <div className="rounded-2xl border border-ok/50 bg-ok/5 p-3"><div className="text-[11.5px] text-muted-foreground">After patch</div><div className="text-[24px] font-light text-ok tabular">1 order</div><div className="text-[11.5px] text-muted-foreground">CHECKOUT-014 passed 3/3</div></div>
                  </div>
                  <div className="mt-3"><CheckLine>Regression: 46 / 46 passed</CheckLine><CheckLine>No new findings introduced</CheckLine><CheckLine>p95 on /api/orders unchanged (212 ms → 218 ms)</CheckLine></div>
                </div>
                <div><MonoLabel>Regression tests passed per suite</MonoLabel><div className="mt-2.5"><PairBars rows={data.suites} max={12} step={4} /></div></div>
              </motion.div>
            ) : patch === "running" ? (
              <div className="grid gap-2">
                {data.suites.map(([l], i) => (
                  <div key={l} className="flex items-center gap-3 text-[12px]">
                    <span className="w-20">{l}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5"><i className="block h-full w-1/3 animate-pulse rounded-full bg-brand/60" style={{ animationDelay: `${i * 120}ms` }} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Results appear here after the patched build passes regression. Before the patch, 43 of 46 regression tests pass.</p>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-3.5">
          <Card title="Diagnosis">
            <p className="text-[13px]">The client retries <code className="font-mono">POST /api/orders</code> after a 450 ms timeout. The server has no idempotency check, so the retry creates a second order.</p>
            <div className="mt-3 flex items-center gap-2"><Meter p={92} c="ai" /><span className="text-[11.5px] tabular">92%</span></div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Confidence, based on 3/3 reproductions and HAR evidence</p>
          </Card>
          <Card title="Contextual repair prompt">
            <pre className="glass-inset rounded-2xl p-3.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap select-all">{data.prompt}</pre>
            <Button variant="glass" size="pill-sm" className="mt-2.5 w-fit" onClick={copy}><Copy />Copy prompt</Button>
          </Card>
        </div>
      </div>

      <GlassDialog open={rc} onOpenChange={setRc} title="Request changes"
        actions={<><Button variant="glass" size="pill" onClick={() => setRc(false)}>Cancel</Button><Button variant="brand" size="pill" onClick={() => { setRc(false); notify("Trevyn will regenerate the patch with your constraint.", "ai") }}>Send to Trevyn</Button></>}>
        <Textarea className="glass-inset min-h-24 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Change request" />
      </GlassDialog>
    </div>
  )
}
