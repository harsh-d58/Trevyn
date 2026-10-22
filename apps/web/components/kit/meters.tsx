"use client"
// Meters and callouts ported from ui.jsx (ConfRing, Bar, HBars, Check, Note) + Regression's history strip.
import { motion } from "motion/react"
import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ConfRing({ p, size = 26 }: { p: number; size?: number }) {
  const r = size / 2 - 3, C = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`AI confidence ${p}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(15 37 87 / .08)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ai)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * C} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-foreground font-mono text-[8px] font-semibold">{p}</text>
    </svg>
  )
}

export type MeterTone = "brand" | "ok" | "warn" | "bad" | "ai" | "det" | "human"
const BG: Record<MeterTone, string> = { brand: "var(--brand)", ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", ai: "var(--ai)", det: "var(--det)", human: "var(--human)" }
/** single linear 0–100 fill; animates in when scrolled into view */
export function Meter({ p, c = "brand", className }: { p: number; c?: MeterTone; className?: string }) {
  return (
    <div className={cn("h-1.5 min-w-14 flex-1 overflow-hidden rounded-full bg-black/5", className)}>
      <motion.i className="block h-full rounded-full" style={{ background: BG[c] }}
        initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(100, p))}%` }} viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  )
}

/** labelled horizontal bars on one scale (max of the rows) */
export function HBars({ rows }: { rows: [label: string, value: number, tone: MeterTone][] }) {
  const m = Math.max(...rows.map((r) => r[1]))
  return (
    <div className="grid gap-3">
      {rows.map(([l, v, c]) => (
        <div key={l}>
          <div className="mb-1 flex justify-between text-[12.5px]"><span>{l}</span><b className="font-semibold tabular">{v.toLocaleString()}</b></div>
          <div className="flex"><Meter p={(v / m) * 100} c={c} /></div>
        </div>
      ))}
    </div>
  )
}

const CHECK = { ok: [CircleCheck, "text-ok"], warn: [CircleAlert, "text-warn"], bad: [CircleX, "text-bad"] } as const
export function CheckLine({ k = "ok", children }: { k?: keyof typeof CHECK; children: React.ReactNode }) {
  const [I, c] = CHECK[k]
  return <div className="flex items-start gap-2 py-1 text-[13px]"><I size={15} className={cn("mt-0.5 shrink-0", c)} /><span>{children}</span></div>
}

const NOTE = { ai: "bg-ai/8 border-ai/25 [&>svg]:text-ai", human: "bg-human/8 border-human/25 [&>svg]:text-human", bad: "bg-bad/8 border-bad/25 [&>svg]:text-bad", ok: "bg-ok/8 border-ok/25 [&>svg]:text-ok" }
export function Note({ tone = "ai", icon: I, children, className }: { tone?: keyof typeof NOTE; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-2.5 rounded-2xl border px-3.5 py-3 text-[12.5px] leading-relaxed", NOTE[tone], className)}>
      {I && <I size={16} className="mt-0.5 shrink-0" />}<div className="min-w-0">{children}</div>
    </div>
  )
}

/** last-20-runs strip used by the regression suite */
export function RunHistoryStrip({ fail = [], warn }: { fail?: number[]; warn?: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: 20 }, (_, i) => (
        <i key={i} title={`Run ${i + 1}`} className={cn("h-[18px] w-[9px] rounded-[2px]", fail.includes(i) ? "bg-bad" : warn === i ? "bg-warn" : "bg-ok/80")} />
      ))}
    </div>
  )
}
