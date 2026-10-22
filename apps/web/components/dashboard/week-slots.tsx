"use client"
// This week (GLASS_DESIGN_LANGUAGE.md C.12): each day is a full-height glass slot the bar fills from the
// bottom. The hatched cap is the inconclusive share, the deck's "explicit uncertainty" made visible.
import { motion } from "motion/react"
import { useState } from "react"
import type { WeekSlot } from "@/lib/types"
import { Card } from "./bits"
import { cn } from "@/lib/utils"

export function WeekSlots({ data }: { data: WeekSlot[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.verified + d.inconclusive))
  const verified = data.reduce((a, d) => a + d.verified, 0)
  const unsure = data.reduce((a, d) => a + d.inconclusive, 0)

  return (
    <Card title="Findings verified" caption="Last 7 days · hatched = inconclusive" className="h-full">
      <div className="flex items-baseline gap-2">
        <span className="text-[24px] leading-none font-light tracking-[-.02em] tabular">{verified}</span>
        <span className="text-[11.5px] text-muted-foreground">verified</span>
        <span className="ml-1 rounded-full bg-warn/12 px-2 py-0.5 text-[10.5px] font-semibold text-warn">{unsure} inconclusive</span>
      </div>
      <div className="mt-3 grid flex-1 grid-cols-7 gap-1.5" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const total = d.verified + d.inconclusive
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5" onMouseEnter={() => setHover(i)}>
              <div className={cn("glass-inset relative flex h-[132px] w-full flex-col justify-end overflow-visible rounded-[12px] p-1 transition-colors",
                d.today && "border-brand/40", hover === i && "border-brand/50 bg-white/70")}>
                <motion.span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[10.5px] font-semibold text-white tabular"
                  initial={false} animate={{ opacity: hover === i ? 1 : 0, y: hover === i ? 0 : 4 }}>{total}</motion.span>
                <motion.div className="flex w-full flex-col overflow-hidden rounded-[8px]"
                  initial={{ height: 0 }} whileInView={{ height: `${(total / max) * 100}%` }} viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.1 + i * 0.05 }}>
                  {d.inconclusive > 0 && <span className="hatch block text-brand/55" style={{ flex: d.inconclusive }} />}
                  <span className={cn("block bg-[linear-gradient(180deg,var(--brand-2),var(--brand))] transition-[filter]", hover === i && "brightness-110")} style={{ flex: d.verified }} />
                </motion.div>
              </div>
              <span className={cn("text-[11px]", d.today ? "font-semibold text-brand" : "text-muted-foreground")}>{d.today ? "Today" : d.day}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
