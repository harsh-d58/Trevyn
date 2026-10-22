"use client"
// StatStrip: the prototype's KpiRow ([label, value, caption, tone] tuples) as glass cards.
// Numeric values count up; captions take the tone colour. `compact` is the inset instrument strip.
import { CountUp } from "@/components/fx/numbers"
import { cn } from "@/lib/utils"
import { toneText, type Tone } from "./pills"

export type Stat = [label: string, value: string | number, caption?: string, tone?: string]

function Value({ v, className }: { v: string | number; className?: string }) {
  const m = typeof v === "number" ? null : /^([^\d−-]*)([−-]?[\d,]*\.?\d+)(.*)$/.exec(v)
  if (typeof v === "number") return <CountUp value={v} className={className} />
  if (!m || /\d\s*[a-z]+\s*\d/i.test(v)) return <span className={className}>{v}</span>
  const n = Number(m[2].replace(/,/g, "").replace("−", "-"))
  const decimals = m[2].includes(".") ? m[2].split(".")[1].length : 0
  return <span className={className}>{m[1]}<CountUp value={n} decimals={decimals} />{m[3]}</span>
}

export function StatStrip({ items, compact, className }: { items: Stat[]; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <div className={cn("glass-inset grid grid-cols-2 gap-px overflow-hidden rounded-2xl sm:grid-cols-3 lg:grid-cols-5", className)}>
        {items.map(([l, v, , t]) => (
          <div key={l} className="bg-white/50 px-4 py-3">
            <div className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">{l}</div>
            <div className={cn("mt-1 text-[18px] font-light tabular", t && toneText[t as Tone])}>{v}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={cn("grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map(([l, v, cap, t = "det"]) => (
        <div key={l} className="glass-1 spot rounded-[20px] px-4.5 py-4">
          <div className="text-[12px] font-medium text-muted-foreground">{l}</div>
          <Value v={v} className="mt-2 block text-[28px] leading-none font-light tracking-[-.02em] text-foreground tabular" />
          {cap && <div className={cn("mt-2 text-[11.5px] font-medium", toneText[(t === "acc" ? "brand" : t) as Tone] ?? "text-muted-foreground")}>{cap}</div>}
        </div>
      ))}
    </div>
  )
}
