"use client"
// Finding detail (PORTING_PLAN.md P1.6, from Board.jsx FindingDetail): bug details, evidence viewer,
// verification, challengeable report history, failure propagation. Only DEF-142 has captured evidence;
// other findings show it clearly labelled as sample evidence (plan decision D4).
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowLeft, Flag, Sparkles, TriangleAlert, User, Wrench } from "lucide-react"
import { Fragment, useState } from "react"
import { FlowMap } from "@/components/charts/flow-map"
import { Waterfall } from "@/components/charts/timing"
import { Card } from "@/components/kit/card"
import { GlassDialog } from "@/components/kit/glass-dialog"
import { CheckLine, Note } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { FindingTypePill, Pill, Severity, Tag, typeLabel } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { getFindingEvidence } from "@/lib/data"
import { PEOPLE, columnName } from "@/lib/demo/core"
import { useLive } from "@/lib/live"
import { notify } from "@/lib/notify"
import type { LogKind } from "@/lib/types"
import { cn } from "@/lib/utils"

type Data = Awaited<ReturnType<typeof getFindingEvidence>>
const TABS = ["Screenshot", "Timeline", "Network", "Console"] as const

export function FindingDetailView({ id, data }: { id: string; data: Data }) {
  const f = useLive((s) => s.findings.find((x) => x.id === id))
  const { evidence: ev, har, sample } = data
  const [tab, setTab] = useState<(typeof TABS)[number]>("Screenshot")
  const [hist, setHist] = useState<[LogKind, string, string][]>(ev.history)
  const [chal, setChal] = useState(false)
  const [obj, setObj] = useState(ev.objection)
  if (!f) return null

  const challenge = () => {
    setChal(false)
    setHist((h) => [...h, ["human", "Challenge raised by Alex Chen", "now"]])
    setTimeout(() => {
      setHist((h) => [...h, ["det", "Re-checked: trace shows 1 click event. Finding upheld.", "now"]])
      notify("Challenge reviewed. Evidence upholds the finding.", "ai")
    }, 1500)
  }

  return (
    <div className="grid gap-3.5">
      <Link href="/board" className="press inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-brand"><ArrowLeft size={14} />Back to board</Link>
      <PageHeader eyebrow={`${f.id} · ${typeLabel(f.type)} · ${f.runId}`} title={f.title}>
        <Button variant="glass" size="pill" onClick={() => notify("Assigned to Priya Rao")}><User />Assign</Button>
        <Button variant="glass" size="pill" onClick={() => notify("Marked as needs review", "warn")}>Mark needs review</Button>
        <Button variant="brand" size="pill" render={<Link href="/repair" />}><Wrench />Generate repair prompt</Button>
      </PageHeader>
      <div className="-mt-1 flex flex-wrap gap-2">
        <Severity s={f.severity} />
        {f.verdict === "inconclusive" ? <Pill tone="warn">Inconclusive</Pill> : f.verdict === "confirmed" ? <Pill tone="ok">Confirmed</Pill> : <Pill tone="human">Likely</Pill>}
        <FindingTypePill t={f.type} /><Pill tone="ai"><Sparkles size={12} />AI confidence {f.confidence}%</Pill><Pill>{columnName(f.column)}</Pill>
        {sample && <Pill tone="warn">Sample evidence (DEF-142)</Pill>}
      </div>
      {sample && <Note tone="human" icon={TriangleAlert}>This demo only has captured evidence for DEF-142. The panels below show that evidence as a sample of what {f.id} will look like once its run artefacts are stored.</Note>}
      <Note tone="bad" icon={TriangleAlert}>{ev.summary}</Note>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.5fr_1fr]">
        <Card title="Bug details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] [&_dd]:font-medium [&_dt]:text-muted-foreground">
            {[...ev.details, ["Owner", PEOPLE[f.owner]] as [string, string]].map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
          <h4 className="mt-4.5 mb-2 text-[13px] font-semibold">Reproduction steps</h4>
          <ol className="grid list-decimal gap-1 pl-4.5 text-[13px]">{ev.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </Card>

        <Card flush title="Evidence viewer" extra={<span className="text-[11.5px] text-muted-foreground">{f.evidence} items · trace, HAR, DB diff</span>}>
          <div className="flex gap-0.5 overflow-x-auto border-b border-border px-3" role="tablist">
            {TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("relative px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors", tab === k ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {k}
                {tab === k && <motion.span layoutId="evidence-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
          </div>
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="p-4" role="tabpanel">
            {tab === "Screenshot" && (
              <div className="glass-inset overflow-hidden rounded-2xl">
                <div className="flex items-center gap-1.5 border-b border-border bg-white/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  <i className="size-2 rounded-full bg-black/10" /><i className="size-2 rounded-full bg-black/10" /><i className="size-2 rounded-full bg-black/10" />staging.shopflow.demo/account/orders · SIMULATED
                </div>
                <div className="grid gap-2 p-3.5">
                  <b className="font-semibold">Order history</b>
                  {ev.orders.map((o) => (
                    <div key={o.id} className={cn("flex justify-between gap-2 rounded-xl border px-3 py-2 text-[12.5px]", o.dup ? "border-bad/60 bg-bad/7" : "border-border bg-white/50")}>
                      <span><b className="font-semibold">{o.id}</b> · {o.status}<br /><span className="text-[11.5px] text-muted-foreground">{o.item} · {o.at}</span></span>
                      <b className="font-semibold tabular">{o.amount}</b>
                    </div>
                  ))}
                  <span className="text-[11.5px] text-bad">{ev.ordersNote}</span>
                </div>
              </div>
            )}
            {tab === "Timeline" && (
              <div className="grid gap-2.5">
                {ev.timeline.map(([t, m, k]) => <div key={t} className="flex items-center gap-2"><span className="font-mono text-[11.5px] text-muted-foreground">{t}</span><Tag k={k} /><span className="text-[13px]">{m}</span></div>)}
              </div>
            )}
            {tab === "Network" && (<><Waterfall rows={har} total={1600} /><p className="mt-3 font-mono text-[11.5px] text-bad">{ev.networkNote}</p></>)}
            {tab === "Console" && (
              <pre className="glass-inset overflow-x-auto rounded-2xl p-3.5 font-mono text-[11.5px] leading-relaxed">{ev.console.join("\n")}{"\n"}<span className="text-bad">{ev.consoleError}</span></pre>
            )}
          </motion.div>
        </Card>

        <div className="grid content-start gap-3.5">
          <Card title="Verification">
            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="glass-inset rounded-2xl p-3"><div className="text-[11.5px] text-muted-foreground">Expected</div><div className="text-[24px] font-light text-ok">{ev.expected}</div></div>
              <div className="rounded-2xl border border-bad/50 bg-bad/6 p-3"><div className="text-[11.5px] text-muted-foreground">Observed</div><div className="text-[24px] font-light text-bad">{ev.observed}</div></div>
            </div>
            <div className="mt-3">{ev.checks.map(([t, k]) => <CheckLine key={t} k={k}>{t}</CheckLine>)}</div>
            <Note tone="human" icon={TriangleAlert} className="mt-2.5">{ev.uncertainty}</Note>
          </Card>
          <Card title="Report history">
            <div className="grid gap-2.5 text-[13px]">
              {hist.map(([k, m, t], i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2">
                  <Tag k={k === "gate" ? "human" : k} /><span className="flex-1">{m}</span><span className="text-[11.5px] text-muted-foreground">{t}</span>
                </motion.div>
              ))}
            </div>
            <Button variant="glass" size="pill" className="mt-3.5 w-full" onClick={() => setChal(true)}><Flag />Challenge finding</Button>
          </Card>
        </div>
      </div>

      <Card title="Failure propagation" extra={<span className="text-[11.5px] text-muted-foreground">retry without Idempotency-Key</span>}>
        <FlowMap w={700} h={140} minW={600} nodes={ev.propagation.nodes} edges={ev.propagation.edges} label="Failure propagation" />
      </Card>

      <GlassDialog open={chal} onOpenChange={setChal} title="Challenge this finding"
        description="Trevyn will re-run the evidence against your objection and record the outcome in the report history."
        actions={<><Button variant="glass" size="pill" onClick={() => setChal(false)}>Cancel</Button><Button variant="brand" size="pill" onClick={challenge}>Submit challenge</Button></>}>
        <Textarea className="glass-inset min-h-24 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none" value={obj} onChange={(e) => setObj(e.target.value)} aria-label="Your objection" />
      </GlassDialog>
    </div>
  )
}
