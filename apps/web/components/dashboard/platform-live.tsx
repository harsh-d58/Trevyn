"use client"
// The live Trevyn platform pipeline (prototype Overview "Trevyn platform · RUN live" map + PLAN/PROBE/PROVE/
// REPAIR strip). Every node and edge is derived from the live store, so the map reacts to the scripted run:
// planning → gate held for a human → workers executing → failure evidence → diagnosis → repair → regression.
import Link from "next/link"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { FlowMap, type FlowEdgeData, type FlowNodeData } from "@/components/charts/flow-map"
import { Card } from "@/components/kit/card"
import { GraphMap, type Graph } from "@/components/runs/run-graph"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { EVIDENCE_TRAIL, STAGES } from "@/lib/demo/runs"
import { LOOP_STAGES, PLATFORM_NODES } from "@/lib/demo/insights"
import { isLive, useLive, useLiveStore } from "@/lib/live"
import { cn } from "@/lib/utils"

function usePlatform() {
  const run = useLive((s) => s.run)
  const pending = useLive((s) => s.approvals.length)
  const repair = useLive((s) => s.repair)
  const live = !!run && isLive(run)
  const stage = run?.log.at(-1)?.stage ?? 0
  const gate = run?.state === "gate"
  const exec = live && !gate && stage >= 2 && stage < 4
  const failed = !!run?.log.some((l) => l.fx === "fail")
  const diag = !!run?.log.some((l) => l.fx === "diag")
  const evN = run ? EVIDENCE_TRAIL.filter((e) => run.log.length > e[2]).length : 0
  const queued = run && live ? run.total - run.done : 0
  return { run, pending, repair, live, stage, gate, exec, failed, diag, evN, queued }
}

/** Live mode: the real LangGraph map of the newest run, refetched as its state and progress change. */
function LivePipeline() {
  const latest = useLive((s) => s.run)
  const scoped = useLive((s) => s.runs.find((r) => r.uuid === s.scope))
  // the picked run, else the newest one
  const run = scoped ? { uuid: scoped.uuid, id: scoped.id, name: scoped.name, apiState: scoped.state, done: scoped.passed } : latest
  const [graph, setGraph] = useState<Graph | null>(null)
  const uuid = run?.uuid, tick = `${run?.apiState}:${run?.done}`
  useEffect(() => {
    if (!uuid) return
    let mounted = true
    api<Graph>(`/api/runs/${encodeURIComponent(uuid)}/graph`).then((g) => { if (mounted) setGraph(g) }).catch(() => {})
    return () => { mounted = false }
  }, [uuid, tick])
  if (!run?.uuid) return <Card title="Trevyn pipeline"><p className="text-[13px] text-muted-foreground">No runs yet. Start one from New test run to see the pipeline move.</p></Card>
  return <GraphMap graph={graph} title={`Trevyn pipeline · ${run.id} · ${run.name}`}
    extra={<Link href={`/runs/live?run=${run.uuid}`} className="text-[12px] font-medium text-brand hover:underline">Open live run →</Link>} />
}

export function PlatformPipeline({ compact }: { compact?: boolean }) {
  return useLive((s) => s.source) === "live" ? <LivePipeline /> : <DemoPipeline compact={compact} />
}

function DemoPipeline({ compact }: { compact?: boolean }) {
  const store = useLiveStore()
  const p = usePlatform()
  const { run, gate, exec, live } = p
  const idle = !live
  const k = (on: boolean, tone: FlowNodeData["k"] = "det") => (on ? tone : "mut")

  const nodes: FlowNodeData[] = PLATFORM_NODES.map((n) => {
    switch (n.id) {
      case "q": return { ...n, sub: `${p.queued} jobs queued`, k: k(live) }
      case "hum": return { ...n, sub: gate ? `${run?.id} waiting` : `${p.pending} waiting`, k: gate || p.pending ? "human" : "mut" }
      case "w": return { ...n, sub: exec ? "3 engines executing" : gate ? "held for approval" : "idle", k: exec ? "det" : gate ? "human" : "mut" }
      case "ev": return { ...n, sub: `${p.evN} items · Postgres`, k: p.evN ? (p.failed ? "bad" : "det") : "mut" }
      case "orch": return { ...n, sub: p.repair === "running" ? "regression on patch" : p.diag ? "diagnosis 0.92" : "LangGraph", k: "ai" }
      case "cp": return { ...n, sub: run ? `FastAPI · ${run.id}` : n.sub, k: k(!!run) }
      default: return n
    }
  })
  const edges: FlowEdgeData[] = [
    { from: "dash", to: "cp", k: "det", s: 2.6 },
    { from: "ci", to: "cp", k: k(live), l: run?.id, s: 2.2 },
    { from: "cp", to: "opa", k: k(!!run), l: "allow" },
    { from: "opa", to: "orch", k: k(live, "ai"), l: run ? `plan ${run.total} tests` : undefined },
    { from: "orch", to: "hum", k: p.pending ? "human" : "mut", l: p.repair === "pending" ? "patch AP-31" : "patch", s: 3 },
    { from: "dev", to: "hum", k: p.pending ? "human" : "mut", s: 3 },
    { from: "cp", to: "q", k: k(live), s: 1.8 },
    { from: "q", to: "w", k: gate ? "human" : k(exec), l: gate ? "on hold" : exec ? `${p.queued} jobs` : undefined, w: exec ? 2.4 : 1.6, s: 1.6 },
    { from: "hum", to: "w", k: gate ? "human" : run?.gateApproved ? "det" : "mut", l: gate ? "awaiting you" : run?.gateApproved ? "approved" : undefined },
    { from: "w", to: "ev", k: p.failed && live ? "bad" : k(exec), l: p.failed ? "CHECKOUT-014" : p.evN ? `${p.evN} evidence` : undefined, w: p.failed ? 2.4 : 1.8 },
    { from: "orch", to: "ev", k: k(p.diag || p.repair !== "pending", "ai"), l: p.repair === "running" ? "regression" : p.diag ? "diagnosis" : undefined },
  ]

  const status = !run ? "No run" : gate ? "Waiting for approval" : run.state === "done" ? "Completed with findings" : run.state === "stopped" ? "Stopped" : `Stage ${p.stage + 1} · ${STAGES[p.stage]}`
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(120deg,#f1ecff_0%,#fdeaf4_52%,#fff6dd_100%)] shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="font-mono text-[10px] tracking-[.14em] text-[#8b7fb8] uppercase">One run context · one evidence trail · scripted demo</div>
          <h2 className="mt-0.5 flex items-center gap-2 text-[17px] font-semibold text-navy">Trevyn platform · {run?.id ?? "idle"} {live && <span className="live-dot size-2 rounded-full bg-[#5cc8b2]" />}</h2>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {[["#a78bfa", "AI-driven"], ["#5cc8b2", "Deterministic"], ["#f2b84b", "Human approval"], ["#f27fae", "Failure evidence"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", gate ? "bg-[#fff1cc] text-[#a86b00]" : live ? "bg-[#dcf5ef] text-[#1f8a76]" : "bg-white/70 text-muted-foreground")}>{status}</span>
          {gate && <Button size="pill-sm" className="rounded-full bg-[#f2b84b] font-semibold text-ink hover:brightness-105" onClick={() => store.approveGate()}><Check />Approve tests</Button>}
          <Link href="/runs/live" className="text-[12px] font-medium text-brand hover:underline">Open live run →</Link>
        </div>
      </div>
      <div className="px-3">
        <FlowMap pastel nodes={nodes} edges={edges} w={950} h={360} nw={178} minW={760} label="Trevyn platform pipeline" />
        {idle && <p className="px-3 pb-3 text-[12px] text-muted-foreground">No run is live. Start one from New test run to see the pipeline move.</p>}
      </div>
      {!compact && (
        <div className="grid grid-cols-2 border-t border-white/70 bg-white/40 md:grid-cols-4">
          {[["Executed", run ? `${run.done} / ${run.total}` : "—"], ["Approvals waiting", String(p.pending)], ["Evidence", `${p.evN} items`], ["Repair", p.repair === "done" ? "verified · 46/46" : p.repair === "running" ? "regression running" : "AP-31 pending"]].map(([l, v]) => (
            <div key={l} className="px-5 py-2"><div className="font-mono text-[9.5px] tracking-[.14em] text-[#8b7fb8] uppercase">{l}</div><div className="font-mono text-[11.5px] tabular">{v}</div></div>
          ))}
        </div>
      )}
    </section>
  )
}

/** PLAN · PROBE · PROVE · REPAIR strip with live status */
const LOOP_STAGE: Record<string, number> = {
  CREATED: 0, VALIDATING_INPUT: 0, PLANNING: 0, PLAN_REVIEW: 0, QUEUED: 0, RUNNING: 1, AWAITING_APPROVAL: 1, CANCELLING: 1,
  COLLECTING_EVIDENCE: 2, VERIFYING: 2, FINDINGS_READY: 3, INCONCLUSIVE: 3, REPORTING: 3, REPAIR_PROPOSED: 3, PATCH_REVIEW: 3, REGRESSION: 3,
}

export function LoopStrip() {
  const p = usePlatform()
  const loop = useLive((s) => s.loop)
  const real = useLive((s) => s.source) === "live"
  const patches = useLive((s) => s.approvals.filter((a) => a.category === "Accepting patches").length)
  const active = !p.live ? -1 : real ? LOOP_STAGE[p.run?.apiState ?? ""] ?? -1 : p.stage <= 1 ? 0 : p.stage === 2 ? 1 : p.stage === 3 ? 2 : 3
  const status = [
    `${loop.plan[0]} / ${loop.plan[1]} tests validated`,
    p.run ? `${p.run.done} / ${p.run.total} executed` : "idle",
    `${loop.prove[0]} / ${loop.prove[1]} failures reproduced`,
    real ? (patches ? `${patches} patch${patches === 1 ? "" : "es"} awaiting approval` : "No patches waiting")
      : p.repair === "done" ? "Patch verified · 46/46" : p.repair === "running" ? "Regression running…" : "1 patch awaiting approval",
  ]
  return (
    <div className="glass-1 grid overflow-hidden rounded-[22px] sm:grid-cols-2 xl:grid-cols-4">
      {LOOP_STAGES.map(([h, d], i) => (
        <div key={h} className={cn("relative border-b border-border p-4 sm:border-r xl:border-b-0 last:border-r-0", active === i && "bg-white/55")}>
          {active === i && <motion.span layoutId="loop-active" className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
          <h4 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-navy">
            <span className={cn("grid size-5 place-items-center rounded-full text-[11px] text-white", active === i ? "bg-brand" : "bg-ink/70")}>{i + 1}</span>{h}
            {active === i && <span className="live-dot ml-auto size-1.5 rounded-full bg-brand" />}
          </h4>
          <p className="my-2 text-[12.5px] text-muted-foreground">{d}</p>
          <span className="inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand tabular">{status[i]}</span>
        </div>
      ))}
    </div>
  )
}
