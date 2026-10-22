"use client"
// AI test planner (from Plans.jsx Planner): describe what to test, generate a plan, and move the autonomy
// limit; the risk × confidence scatter and the generated list react to it.
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { Check, FileText, Inbox, LoaderCircle, Sparkles } from "lucide-react"
import { useState } from "react"
import { RiskScatter } from "@/components/charts/bars"
import { Card } from "@/components/kit/card"
import { Note } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, Severity } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { AUTONOMY, AUTONOMY_LABEL, AUTONOMY_THR, GENERATED, PLANNER_CONTEXT, PLANNER_REQUEST, RISK_POINTS } from "@/lib/demo/insights"

const RISK = ["low", "medium", "high"]

export function PlannerView() {
  const [req, setReq] = useState(PLANNER_REQUEST)
  const [aut, setAut] = useState(1)
  const [state, setState] = useState<"idle" | "loading" | "done">("idle")
  const gen = () => { setState("loading"); setTimeout(() => setState("done"), 1300) }
  const thr = AUTONOMY_THR[aut]
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Intelligence" title="AI test planner" sub="Describe what to test. Trevyn reads the URL, repo and requirements, then proposes a plan you can check." />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card flush>
          <div className="p-4">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">Testing request
              <Textarea className="glass-inset min-h-28 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none" value={req} onChange={(e) => setReq(e.target.value)} />
            </label>
            <div className="my-3 flex flex-wrap gap-1.5">{PLANNER_CONTEXT.map((s) => <span key={s} className="glass-inset flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px]"><FileText size={12} />{s}</span>)}</div>
            <Button variant="brand" size="pill" onClick={gen} disabled={state === "loading"}>
              {state === "loading" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{state === "loading" ? "Generating…" : state === "done" ? "Regenerate plan" : "Generate plan"}
            </Button>
          </div>
          <AnimatePresence mode="wait">
            {state === "loading" && (
              <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-border p-4 text-[13px] text-muted-foreground">
                <span className="animate-pulse">Reading requirements and repo…</span>
              </motion.div>
            )}
            {state === "done" && (
              <motion.div key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-border">
                {GENERATED.map(([id, t, r], i) => {
                  const auto = RISK.indexOf(r) <= aut && r !== "high"
                  return (
                    <motion.div key={id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 hover:bg-white/50">
                      <span className="font-mono text-[11.5px] text-muted-foreground">{id}</span><div className="flex-1 text-[13px]">{t}</div><Severity s={r} />
                      <Pill tone={auto ? "det" : "human"}>{auto ? "Auto-run" : "Needs approval"}</Pill>
                    </motion.div>
                  )
                })}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><Check size={12} />Self-check passed · 6 / 6 tests executable</span>
                  <Button variant="brand" size="pill-sm" render={<Link href="/plans" />}>Open in Test Plans</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
        <Card title="Risk-based autonomy" caption="Trevyn runs tests on its own up to this risk level. Anything above it waits for a person.">
          <Slider value={aut} min={0} max={2} step={1} onValueChange={(v) => setAut(Array.isArray(v) ? v[0] : v)} aria-label="Autonomy level" className="mt-2" />
          <div className="mt-2 flex justify-between text-[11.5px] text-muted-foreground"><span>Low</span><span>Medium</span><span>High</span></div>
          <motion.div key={aut} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}><Note tone="human" icon={Inbox} className="mt-3.5">{AUTONOMY[aut]}</Note></motion.div>
        </Card>
      </div>
      <Card title="Risk vs AI confidence · autonomy threshold" extra={<span className="text-[11.5px] text-muted-foreground">Teal runs automatically · amber waits for a person</span>}>
        <RiskScatter thr={thr} thrLabel={AUTONOMY_LABEL[aut]} pts={RISK_POINTS.map(([id, x, y]) => ({ id, x, y, auto: x <= thr && x < 85 }))} />
      </Card>
    </div>
  )
}
