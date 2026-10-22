"use client"
// Progress visuals ported from rcharts.jsx: wizard Stepper, run Pipeline, LiveSpark, Sparkline, PairBars.
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { MonoLabel } from "@/components/kit/pills"
import { cn } from "@/lib/utils"

/** Connected wizard stepper: nodes joined by a rail that fills as steps complete */
export function Stepper({ steps, step, onStep }: { steps: string[]; step: number; onStep: (i: number) => void }) {
  return (
    <div className="glass-2 overflow-x-auto rounded-[22px] px-3 pt-4 pb-3">
      <ol className="flex min-w-[640px]">
        {steps.map((s, i) => {
          const done = i < step, on = i === step
          return (
            <li key={s} className="relative flex-1">
              {i > 0 && (
                <span className="absolute top-[13px] right-1/2 -left-1/2 h-[3px] overflow-hidden rounded-full bg-black/5">
                  <motion.i className={cn("block h-full", on ? "bg-brand" : "bg-ok")} initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.45 }} />
                </span>
              )}
              <button onClick={() => onStep(i)} aria-current={on ? "step" : undefined} className="press relative z-10 flex w-full flex-col items-center gap-1.5">
                <span className={cn("grid size-[29px] place-items-center rounded-full border-2 font-mono text-[11px] font-semibold transition",
                  done ? "border-ok bg-ok text-white" : on ? "border-brand bg-white text-brand ring-4 ring-brand/15" : "border-border bg-white/70 text-muted-foreground")}>
                  {done ? <Check size={14} strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className={cn("text-[12.5px] whitespace-nowrap", on ? "font-semibold text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}>{s}</span>
                <span className={cn("font-mono text-[9.5px] tracking-[.14em] uppercase", on ? "text-brand" : done ? "text-ok" : "text-muted-foreground/70")}>{done ? "Done" : on ? "Editing" : "Pending"}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Run pipeline: stages are segments of one rail; the active segment fills with progress */
const PT = { run: ["bg-brand", "border-brand", "text-brand"], gate: ["bg-human", "border-human", "text-human"], stop: ["bg-bad", "border-bad", "text-bad"], done: ["bg-ok", "border-ok", "text-ok"] }
export function Pipeline({ stages, cur, frac, state, notes = [] }: { stages: string[]; cur: number; frac: number; state: keyof typeof PT; notes?: string[] }) {
  return (
    <div className="glass-1 overflow-x-auto rounded-[22px]">
      <ol className="grid min-w-[680px] grid-cols-5">
        {stages.map((s, j) => {
          const done = state === "done" || j < cur, on = !done && j === cur, t = PT[state]
          const p = done ? 100 : on ? Math.max(6, frac * 100) : 0
          return (
            <li key={s} className={cn("pt-4 pb-3.5", on && "bg-white/50")}>
              <div className="flex items-center">
                <span className={cn("ml-4 grid size-[18px] shrink-0 place-items-center rounded-full border-2", done ? "border-ok bg-ok text-white" : on ? cn(t[1], "bg-white") : "border-border bg-white/70")}>
                  {done ? <Check size={10} strokeWidth={3.5} /> : on && <i className={cn("size-1.5 rounded-full", t[0], state === "run" && "animate-pulse")} />}
                </span>
                <span className="mx-1.5 h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                  <i className={cn("block h-full rounded-full transition-all duration-700", done ? "bg-ok" : t[0])} style={{ width: `${p}%` }} />
                </span>
              </div>
              <div className="mt-2.5 px-4">
                <MonoLabel className="text-[9.5px]">Stage 0{j + 1}</MonoLabel>
                <b className="block text-[13.5px] leading-tight font-semibold">{s}</b>
                <span className={cn("mt-0.5 block font-mono text-[10.5px] tabular", done ? "text-ok" : on ? t[2] : "text-muted-foreground/70")}>{done ? "complete" : on ? notes[j] : "queued"}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Small live sparkline on a fixed scale; colours passed in so it can sit on the dark stage */
export function LiveSpark({ vals, n, max, stroke, fill, text, w = 220, h = 56 }: { vals: number[]; n: number; max: number; stroke: string; fill: string; text: string; w?: number; h?: number }) {
  const L = 18, T = 6, B = 6, x = (i: number) => L + (i * (w - L - 2)) / Math.max(1, n - 1), y = (v: number) => T + ((max - v) / max) * (h - T - B)
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" "), last = vals.length - 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Throughput ${vals[last] ?? 0} tests per minute`}>
      {[0, max].map((v) => <g key={v}><line x1={L} x2={w} y1={y(v)} y2={y(v)} stroke={text} strokeOpacity=".25" strokeDasharray="2 3" /><text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill={text}>{v}</text></g>)}
      {vals.length > 1 && <><polygon points={`${x(0)},${y(0)} ${pts} ${x(last)},${y(0)}`} fill={fill} opacity=".25" /><polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" /></>}
      {vals.length > 0 && <circle cx={x(last)} cy={y(vals[last])} r="3" fill={stroke} />}
    </svg>
  )
}

export function Sparkline({ v, color = "var(--brand)", w = 100, h = 28 }: { v: number[]; color?: string; w?: number; h?: number }) {
  const lo = Math.min(...v), hi = Math.max(...v)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" points={v.map((n, i) => `${(i * w) / (v.length - 1)},${h - 2 - ((n - lo) / (hi - lo || 1)) * (h - 6)}`).join(" ")} />
    </svg>
  )
}

/** Paired bars on one count scale: before vs after, per suite. rows = [label, before, after, total] */
export function PairBars({ rows, max, step }: { rows: [string, number, number, number][]; max: number; step: number }) {
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return (
    <div className="grid grid-cols-[minmax(84px,auto)_1fr_auto] items-center gap-x-3 gap-y-2 text-[12px]">
      <span />
      <div className="relative h-4">{ticks.map((t) => <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground tabular first:translate-x-0 last:-translate-x-full" style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}</div>
      <span />
      {rows.flatMap(([l, b, a, t], i) => [
        <span key={l + "l"} className="font-medium">{l}</span>,
        <div key={l + "b"} className="relative grid gap-1 py-0.5">
          {ticks.slice(1, -1).map((v) => <i key={v} className="absolute inset-y-0 w-px bg-border" style={{ left: `${(v / max) * 100}%` }} />)}
          <div className="relative h-2 rounded-full bg-black/5" style={{ width: `${(t / max) * 100}%` }}><i className={cn("block h-full rounded-full", b < t ? "bg-bad/70" : "bg-muted-foreground/40")} style={{ width: `${(b / t) * 100}%` }} /></div>
          <div className="relative h-2 rounded-full bg-black/5" style={{ width: `${(t / max) * 100}%` }}>
            <motion.i className="block h-full rounded-full bg-ok" initial={{ width: 0 }} animate={{ width: `${(a / t) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 + i * 0.06 }} />
          </div>
        </div>,
        <span key={l + "v"} className="font-mono text-[11px] tabular"><span className={b < t ? "text-bad" : "text-muted-foreground"}>{b}</span><span className="text-muted-foreground">→</span><span className="text-ok">{a}</span><span className="text-muted-foreground">/{t}</span></span>,
      ])}
    </div>
  )
}
