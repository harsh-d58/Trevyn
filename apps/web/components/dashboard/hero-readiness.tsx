"use client"
// Release readiness hero (GLASS_DESIGN_LANGUAGE.md C.8 + DASHBOARD_DESIGN_SPEC.md §4.8): the deck's prism
// gradient, a giant light numeral, a gate-notched progress bar and a white tick gauge. The CTA morphs
// idle → sending → requested and files AP-28 into the review queue through the live store.
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Check, LoaderCircle, Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { CountUp } from "@/components/fx/numbers"
import { useLive, useLiveStore } from "@/lib/live"
import type { GateStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

// one linear scale for bar and gauge: 80% … 100%
const LO = 80, HI = 100
const pos = (v: number) => Math.min(1, Math.max(0, (v - LO) / (HI - LO)))

function TickGauge({ value, gate }: { value: number; gate: number }) {
  const N = 41, R = 78, cx = 96, cy = 92
  const filled = Math.round(pos(value) * (N - 1))
  const gateI = Math.round(pos(gate) * (N - 1))
  return (
    <svg viewBox="0 0 192 112" className="w-full max-w-[240px]" role="img" aria-label={`Pass rate ${value}% against a ${gate}% gate`}>
      {Array.from({ length: N }, (_, i) => {
        const a = Math.PI - (i / (N - 1)) * Math.PI
        const isGate = i === gateI
        const len = isGate ? 20 : 13
        // rounded so server and client serialise identical attribute strings
        const r2 = (v: number) => Math.round(v * 100) / 100
        const x1 = r2(cx + Math.cos(a) * R), y1 = r2(cy - Math.sin(a) * R)
        const x2 = r2(cx + Math.cos(a) * (R - len)), y2 = r2(cy - Math.sin(a) * (R - len))
        return (
          <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" strokeWidth={isGate ? 3 : 2.2}
            stroke={isGate ? "#ffd08a" : "#fff"}
            initial={{ opacity: 0.22 }} animate={{ opacity: isGate ? 1 : i <= filled ? 1 : 0.22 }}
            transition={{ delay: i <= filled ? 0.3 + i * 0.014 : 0, duration: 0.2 }} />
        )
      })}
      <text x={cx} y={cy - 22} textAnchor="middle" className="fill-white/75 text-[9px]">Release gate</text>
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-white text-[17px] font-light">{gate}%</text>
      <text x={cx - R} y={cy + 16} textAnchor="middle" className="fill-white/65 text-[9px]">{LO}%</text>
      <text x={cx + R} y={cy + 16} textAnchor="middle" className="fill-white/65 text-[9px]">{HI}%</text>
    </svg>
  )
}

export function HeroReadiness({ gate }: { gate: GateStatus }) {
  const store = useLiveStore()
  const requested = useLive((s) => s.releaseRequested)
  const [sending, setSending] = useState(false)
  const router = useRouter()
  const below = gate.passRate < gate.gate
  const state = requested ? "done" : sending ? "sending" : "idle"

  const request = () => {
    if (state !== "idle") return
    setSending(true)
    setTimeout(() => {
      store.requestRelease()
      setSending(false)
      toast(`Release ${gate.release} sent for sign-off`, {
        description: "Filed as AP-28 in your review queue.",
        action: { label: "View", onClick: () => router.push("/approvals") },
      })
    }, 900)
  }

  return (
    <section className={cn(
      "relative isolate flex min-h-[300px] flex-col overflow-hidden rounded-[24px] p-5 text-white shadow-[0_24px_48px_-24px_rgb(36_87_230/.55)]",
      "bg-[length:170%_170%] [animation:prism-drift_18s_ease-in-out_infinite_alternate] transition-[background-image] duration-700",
      below
        ? "bg-[linear-gradient(120deg,#d03636_0%,#e5484d_45%,#f08c2e_100%)]"
        : "bg-[linear-gradient(120deg,var(--brand)_0%,var(--ai)_40%,var(--det)_78%,var(--human)_118%)]",
    )}>
      <span aria-hidden className="absolute -top-24 -left-16 -z-10 h-56 w-80 rounded-full bg-white/25 blur-3xl" />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_40%,rgb(11_26_61/.22))]" />

      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur-md">
          <Sparkles size={12} />Release {gate.release}
        </span>
        <span className="text-[11.5px] text-white/80">{gate.scope ?? "Staging · ShopFlow"}</span>
      </div>

      <div className="mt-4 grid flex-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <CountUp value={gate.passRate} decimals={1} suffix="%" className="block text-[56px] leading-none font-extralight tracking-[-.03em] tabular" />
          <p className="mt-2 text-[13px] text-white/85">pass rate · {below ? "below" : "above"} the {gate.gate}% gate · {gate.weekDelta > 0 ? "+" : ""}{gate.weekDelta} pts this week</p>
          <div className="relative mt-4 h-2 rounded-full bg-white/25">
            <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${pos(gate.passRate) * 100}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
            <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-[#ffd08a]" style={{ left: `${pos(gate.gate) * 100}%` }} title={`Gate ${gate.gate}%`} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-white/75 tabular"><span>Passed {gate.passed}</span><span>Failed {gate.failed}</span></div>
        </div>
        <div className="hidden w-[210px] sm:block"><TickGauge value={gate.passRate} gate={gate.gate} /></div>
      </div>

      <motion.button layout onClick={request} disabled={state !== "idle"}
        className={cn("press pulse mt-5 inline-flex h-10 items-center gap-2 self-start overflow-hidden rounded-full px-4 text-[13px] font-semibold transition-colors",
          state === "done" ? "bg-white/20 text-white ring-1 ring-white/40" : "bg-white text-ink hover:bg-white/90")}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={state} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="inline-flex items-center gap-2">
            {state === "idle" && <>Request release approval<ArrowUpRight size={15} /></>}
            {state === "sending" && <><LoaderCircle size={15} className="animate-spin" />Sending</>}
            {state === "done" && <><Check size={15} />Requested · AP-28</>}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </section>
  )
}
