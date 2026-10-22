"use client"
// Live run (PORTING_PLAN.md P1.3, from trevyn-app Runs.jsx LiveRun). Everything derives from the store's
// one scripted run, so this page, the island and the Overview always agree (plan §3.6).
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, CirclePlay, Plus } from "lucide-react"
import { useEffect, useRef } from "react"
import type { FlowEdgeData, FlowNodeData } from "@/components/charts/flow-map"
import { FlowMap } from "@/components/charts/flow-map"
import { LiveSpark, Pipeline } from "@/components/charts/progress"
import { Card, StagePanel, StageStats } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Legend, MonoLabel, Pill, Tag, type Tone } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { EVIDENCE_TRAIL, LIVE_SCRIPT, STAGES } from "@/lib/demo/runs"
import { useLive, useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const BASE = Date.UTC(2026, 9, 21, 11, 12, 0)
const stamp = (i: number) => new Date(BASE + i * 7000).toISOString().slice(11, 19)
const ofStage = (s: number) => LIVE_SCRIPT.filter((l) => l.stage === s).length

export function LiveRunView() {
  const store = useLiveStore()
  const run = useLive((s) => s.run)
  const logRef = useRef<HTMLDivElement>(null)
  const lines = run?.log.length ?? 0
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }) }, [lines])

  if (!run) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Card className="max-w-md items-center text-center">
          <h1 className="text-[24px] font-medium">No run in progress</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Start a test run to watch Trevyn plan, execute and verify it here.</p>
          <Button variant="brand" size="pill" className="mt-4" render={<Link href="/runs/new" />}><Plus />New test run</Button>
        </Card>
      </div>
    )
  }

  const stopped = run.state === "stopped", done = run.state === "done", atGate = run.state === "gate"
  const stage = run.log.at(-1)?.stage ?? 0
  const inStage = (s: number) => run.log.filter((l) => l.stage === s).length
  const passed = Math.max(0, run.done - run.failed - run.inconclusive), pending = run.total - run.done
  const status: [Tone, string] = stopped ? ["bad", "Stopped"] : done ? ["warn", "Completed with findings"] : atGate ? ["human", "Waiting for approval"] : ["brand", "Running"]
  const pstate = stopped ? "stop" : done ? "done" : atGate ? "gate" : "run"
  const notes = STAGES.map((_, s) => (stopped ? "stopped" : atGate && s === stage ? "awaiting approval" : `${inStage(s)} / ${ofStage(s)} events`))
  const tp = run.log.length ? run.log.map((l) => l.tp) : [0]
  const evN = EVIDENCE_TRAIL.filter((e) => run.log.length > e[2]).length
  const failedLine = run.log.some((l) => l.fx === "fail")

  // worker network reacts to the run state (prototype nodes/edges)
  const exec = stage >= 2 && !stopped && !done
  const k = (on: boolean) => (stopped ? "mut" : on ? "det" : "mut") as FlowNodeData["k"]
  const queued = done || stopped ? 0 : run.total - run.done
  const nodes: FlowNodeData[] = [
    { id: "cp", label: "Control plane", sub: `FastAPI · ${run.id}`, x: 100, y: 150, k: stopped ? "mut" : "det" },
    { id: "q", label: "Redis · Celery", sub: `${queued} jobs queued`, x: 320, y: 150, k: k(stage >= 1) },
    { id: "pw", label: "Playwright", sub: "3 browsers · 3 slots", x: 560, y: 55, k: k(exec) },
    { id: "api", label: "API & unit", sub: "pytest · Vitest", x: 560, y: 150, k: k(exec) },
    { id: "zap", label: "ZAP · Semgrep", sub: "passive baseline", x: 560, y: 245, k: k(exec) },
    { id: "ev", label: "Evidence store", sub: `${evN} items · Postgres`, x: 800, y: 150, k: k(evN > 0) },
  ]
  const edges: FlowEdgeData[] = [
    { from: "cp", to: "q", k: stopped ? "mut" : atGate ? "human" : stage >= 1 ? "det" : "mut", l: atGate ? "on hold" : stage >= 1 ? `${run.total} jobs` : "planning", w: 2.2, s: 1.8 },
    { from: "q", to: "pw", k: k(exec), l: exec ? "24 UI" : undefined, s: 1.7 },
    { from: "q", to: "api", k: k(exec), l: exec ? "22 API" : undefined, s: 1.5 },
    { from: "q", to: "zap", k: k(exec), l: exec ? "scan" : undefined, s: 2.2 },
    { from: "pw", to: "ev", k: stopped ? "mut" : failedLine ? "bad" : k(exec), l: failedLine ? "CHECKOUT-014" : undefined, w: failedLine ? 2.2 : 1.6, s: 2 },
    { from: "api", to: "ev", k: k(exec), s: 2.4 },
    { from: "zap", to: "ev", k: k(exec), s: 2.8 },
  ]

  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow={<span className="inline-flex items-center gap-2">Live <span className="rounded bg-human/15 px-1.5 font-mono text-[10px] text-human">SCRIPTED DEMO</span></span>}
        title={`${run.id} · ${run.name}`} sub="Live run for ShopFlow Commerce · Gray-box · budget 15 min">
        <Legend className="mr-2 hidden lg:inline-flex" />
        <Button variant="glass" size="pill" render={<Link href="/runs" />}>All runs</Button>
        <Button variant="danger" size="pill" disabled={done || stopped} onClick={() => { store.stopRun(); notify("Run stopped. Evidence collected so far is kept.", "warn") }}>Stop run</Button>
      </PageHeader>

      <StagePanel eyebrow="Worker network · isolated Docker pool" title={`${run.id} data plane`}
        legend={[["#5cc8b2", "Deterministic"], ["#f2b84b", "Held for approval"], ["#f27fae", "Failure evidence"], ["#b9b4cc", "Idle"]]}
        aside={
          <div className="rounded-2xl border glass-inset px-3 pt-2 pb-1">
            <div className="flex items-baseline justify-between gap-3.5">
              <span className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">Throughput</span>
              <span className="font-mono text-[13px] font-semibold text-[#45dcc6] tabular">{tp.at(-1)} <span className="text-[10.5px] font-normal text-muted-foreground">tests/min</span></span>
            </div>
            <LiveSpark vals={tp} n={LIVE_SCRIPT.length} max={24} stroke="#5cc8b2" fill="#5cc8b2" text="#8b7fb8" />
          </div>
        }
        footer={<StageStats items={[["Workers", exec ? "3 / 4 active" : "0 / 4 active"], ["Queue depth", `${queued} jobs`], ["Egress", "staging.shopflow.demo"], ["Evidence", `${evN} items stored`]]} />}>
        <FlowMap pastel nodes={nodes} edges={edges} w={900} h={300} minW={720} label="Worker network" />
      </StagePanel>

      <Pipeline stages={STAGES} cur={stage} frac={inStage(stage) / ofStage(stage)} state={pstate} notes={notes} />

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="Run log" extra={<Pill tone={status[0]} dot pulse={status[1] === "Running"}>{status[1]}</Pill>}>
          <div ref={logRef} aria-live="polite" className="glass-inset h-[340px] overflow-auto rounded-2xl px-3.5 py-3 font-mono text-[11.5px] leading-[1.8]">
            <AnimatePresence initial={false}>
              {run.log.map((l) => (
                <motion.div key={l.i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-baseline gap-2.5">
                  <span className="shrink-0 text-muted-foreground">{stamp(l.i)}</span>
                  <Tag k={l.kind === "gate" ? "human" : l.kind} />
                  <span className="min-w-0">
                    {l.text}{" "}
                    {l.kind === "gate" && (run.gateApproved
                      ? <Pill tone="ok">Approved by Alex Chen</Pill>
                      : atGate
                        ? <Button variant="human" size="pill-sm" className="ml-1 align-middle" onClick={() => { store.approveGate(); notify("High-impact tests approved. Run continues.") }}>Approve and continue</Button>
                        : <Pill tone="bad">Not approved</Pill>)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {!done && !stopped && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-foreground/50 align-middle" aria-hidden />}
          </div>
        </Card>

        <div className="grid content-start gap-3.5">
          <Card title="Results" extra={<span className="font-mono text-[11.5px] tabular">{run.done} / {run.total} executed</span>}>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-sm bg-black/5">
              {([[passed, "bg-ok"], [run.failed, "bg-bad"], [run.inconclusive, "bg-warn"]] as const).map(([v, c], j) => v > 0 && <i key={j} className={cn("block h-full transition-all duration-500", c)} style={{ width: `${(v / run.total) * 100}%` }} />)}
            </div>
            <dl className="mt-3.5 grid grid-cols-4 divide-x divide-border">
              {([["Passed", passed, "text-ok"], ["Failed", run.failed, "text-bad"], ["Inconcl.", run.inconclusive, "text-warn"], ["Pending", pending, "text-muted-foreground"]] as const).map(([l, v, c]) => (
                <div key={l} className="px-2 first:pl-0">
                  <dt className="font-mono text-[9.5px] tracking-[.12em] text-muted-foreground uppercase">{l}</dt>
                  <dd className={cn("text-[24px] leading-tight font-light tabular", c)}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Evidence trail" extra={<span className="font-mono text-[11.5px] text-muted-foreground tabular">{evN} / {EVIDENCE_TRAIL.length}</span>}>
            <ol className="relative grid gap-2.5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
              {EVIDENCE_TRAIL.map(([n, d, at]) => {
                const got = run.log.length > at
                return (
                  <li key={n} className="relative flex items-start gap-3">
                    <motion.i initial={false} animate={{ scale: got ? [1.4, 1] : 1 }} className={cn("relative mt-1 size-[11px] shrink-0 rounded-full border-2", got ? "border-det bg-det" : "border-border bg-white")} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[13px] font-medium", !got && "text-muted-foreground")}>{n}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{got ? d : "pending"}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
          {done && <Button variant="brand" size="pill" className="w-full" render={<Link href="/findings/DEF-142" />}>Open finding DEF-142<ArrowRight /></Button>}
          {(done || stopped) && <Button variant="glass" size="pill" className="w-full" render={<Link href="/runs/new" />}><CirclePlay />Start another run</Button>}
          <MonoLabel className="text-center">Scripted demo · no live system is being tested</MonoLabel>
        </div>
      </div>
    </div>
  )
}
