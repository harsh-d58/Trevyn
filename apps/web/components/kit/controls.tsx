"use client"
// Small controls shared by charts and cards: segmented range pill, glass Recharts tooltip, date label.
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

/* Segmented range pill (7D / 30D) */
export function RangeToggle<T extends string>({ value, options, onChange, id }: { value: T; options: T[]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="glass-inset inline-flex shrink-0 rounded-full p-0.5" role="radiogroup">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={cn("press relative rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors", value === o ? "text-white" : "text-muted-foreground hover:text-foreground")}>
          {value === o && <motion.span layoutId={`range-${id}`} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
          <span className="relative">{o}</span>
        </button>
      ))}
    </div>
  )
}

/* Recharts tooltip in glass */
type TipRow = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown; payload?: unknown }
export function GlassTooltip({ active, payload, label, labelFormat, rows }: {
  active?: boolean; payload?: readonly TipRow[]; label?: unknown
  labelFormat?: (l: string) => string; rows?: Record<string, string>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-2 min-w-36 rounded-2xl bg-[var(--g2)] px-3 py-2 text-[11.5px]">
      <div className="mb-1 text-[10.5px] text-muted-foreground">{labelFormat ? labelFormat(String(label)) : String(label)}</div>
      {payload.filter((p) => !rows || String(p.dataKey) in rows).map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <i className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{rows?.[String(p.dataKey)] ?? String(p.name)}</span>
          <b className="ml-auto pl-3 font-semibold tabular">{Number(p.value).toLocaleString()}</b>
        </div>
      ))}
    </div>
  )
}

export const shortDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
