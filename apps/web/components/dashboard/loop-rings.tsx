"use client"
// Today's loop (GLASS_DESIGN_LANGUAGE.md C.9): three concentric rings in the deck legend colours.
// Hovering a ring or its legend row highlights both; a ring reaching 100% plays one sparkle sweep.
import { motion } from "motion/react"
import { useState } from "react"
import { useLive } from "@/lib/live"
import { Card } from "./bits"
import { cn } from "@/lib/utils"

const RINGS = [
  { key: "plan", label: "Plan", sub: "tests validated", color: "var(--ai)", r: 62 },
  { key: "prove", label: "Prove", sub: "failures reproduced", color: "var(--det)", r: 46 },
  { key: "decide", label: "Decide", sub: "approvals cleared", color: "var(--human)", r: 30 },
] as const

export function LoopRings() {
  const loop = useLive((s) => s.loop)
  const [hover, setHover] = useState<string | null>(null)
  return (
    <Card title="Today's loop" caption="Close your rings: plan, prove, decide" className="h-full">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
        <svg viewBox="0 0 150 150" className="size-[150px] shrink-0 -rotate-90" onMouseLeave={() => setHover(null)}>
          {RINGS.map((ring, i) => {
            const [v, of] = loop[ring.key]
            const p = of ? v / of : 0
            const dim = hover && hover !== ring.key
            return (
              <g key={ring.key} onMouseEnter={() => setHover(ring.key)} className="cursor-pointer">
                <circle cx="75" cy="75" r={ring.r} fill="none" stroke={ring.color} strokeOpacity=".14" strokeWidth="12" />
                <motion.circle cx="75" cy="75" r={ring.r} fill="none" stroke={ring.color} strokeLinecap="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: p, opacity: dim ? 0.35 : 1, strokeWidth: hover === ring.key ? 14 : 12 }}
                  transition={{ pathLength: { duration: 1, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }, default: { duration: 0.2 } }} />
                {p >= 1 && (
                  <motion.circle key={`spark-${of}`} cx="75" cy="75" r={ring.r} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
                    initial={{ pathLength: 0.08, pathOffset: 0, opacity: 0.9 }} animate={{ pathOffset: 1, opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeInOut" }} />
                )}
              </g>
            )
          })}
        </svg>
        <ul className="grid w-full max-w-[220px] gap-1.5">
          {RINGS.map((ring) => {
            const [v, of] = loop[ring.key]
            return (
              <li key={ring.key} onMouseEnter={() => setHover(ring.key)} onMouseLeave={() => setHover(null)}
                className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-[background-color,opacity]", hover === ring.key && "bg-white/70", hover && hover !== ring.key && "opacity-50")}>
                <span className="h-7 w-1 rounded-full" style={{ background: ring.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">{ring.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{ring.sub}</div>
                </div>
                <span className="text-[18px] font-light tabular">{v}<span className="text-[12px] text-muted-foreground">/{of}</span></span>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
