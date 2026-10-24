"use client"
// Findings by category (DASHBOARD_DESIGN_SPEC.md §4.6): a polar-area chart, equal angles with radius
// encoding count on one linear scale. Wedges grow in clockwise; hovering a wedge or legend row pushes the
// wedge out along its bisector and dims the rest. Click filters the findings list.
import Link from "next/link"
import { animate, motion, useMotionValue, useTransform } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import type { CategorySlice, FindingType } from "@/lib/types"
import { Card } from "./bits"
import { cn } from "@/lib/utils"
import { CircleCheck } from "lucide-react"

const COLOR: Record<FindingType, string> = { ui: "var(--cat-ui)", api: "var(--cat-api)", perf: "var(--cat-perf)", security: "var(--cat-sec)", compat: "var(--cat-compat)" }
const C = 90, R_MIN = 26, R_MAX = 84

function arc(a0: number, a1: number, r: number) {
  const p = (a: number) => `${C + Math.sin(a) * r},${C - Math.cos(a) * r}`
  return `M${C},${C} L${p(a0)} A${r},${r} 0 0 1 ${p(a1)} Z`
}

function Wedge({ slice, i, n, r, active, dim, onHover, onClick }: {
  slice: CategorySlice; i: number; n: number; r: number; active: boolean; dim: boolean; onHover: (k: FindingType | null) => void; onClick: () => void
}) {
  const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, mid = (a0 + a1) / 2
  const t = useMotionValue(0)
  useEffect(() => { const c = animate(t, 1, { duration: 0.6, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }); return () => c.stop() }, [t, i])
  const d = useTransform(t, (v) => arc(a0, a0 + (a1 - a0) * v, R_MIN * 0.6 + (r - R_MIN * 0.6) * v))
  const push = active ? 6 : 0
  return (
    <motion.path d={d} fill={`url(#wedge-${slice.type})`} stroke="#fff" strokeWidth={2} strokeLinejoin="round"
      style={{ transform: `translate(${Math.sin(mid) * push}px, ${-Math.cos(mid) * push}px)`, opacity: dim ? 0.35 : 1, transition: "transform .28s cubic-bezier(.22,1,.36,1), opacity .2s", cursor: "pointer" }}
      onMouseEnter={() => onHover(slice.type)} onMouseLeave={() => onHover(null)} onClick={onClick}>
      <title>{`${slice.label}: ${slice.count} findings, ${slice.high} high`}</title>
    </motion.path>
  )
}

export function CategoryPolar({ data, live = false }: { data: CategorySlice[]; live?: boolean }) {
  const router = useRouter()
  const [hover, setHover] = useState<FindingType | null>(null)
  const total = data.reduce((a, s) => a + s.count, 0)
  const max = Math.max(1, ...data.map((s) => s.count))
  const radius = (c: number) => R_MIN + (c / max) * (R_MAX - R_MIN)

  return (
    <Card title="Findings by category" caption={`${total} ${live ? "findings" : "sample findings"}`} className="overview-categories h-full">
      {!total ? <div className="flex min-h-[180px] flex-col items-center justify-center text-center"><span className="overview-empty-icon"><CircleCheck size={21} /></span><p className="mt-3 text-[13px] font-semibold">No findings</p><Link href="/findings" className="overview-text-link mt-4">View findings →</Link></div> : <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
        <svg viewBox="0 0 180 180" className="size-[180px] shrink-0 overflow-visible" role="img" aria-label="Findings by category">
          <defs>
            {data.map((s) => (
              <linearGradient key={s.type} id={`wedge-${s.type}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={COLOR[s.type]} />
                <stop offset="100%" stopColor={COLOR[s.type]} stopOpacity={0.55} />
              </linearGradient>
            ))}
          </defs>
          <circle cx={C} cy={C} r={R_MAX} fill="rgb(255 255 255 / .45)" stroke="rgb(15 37 87 / .06)" />
          <circle cx={C} cy={C} r={(R_MIN + R_MAX) / 2} fill="none" stroke="rgb(15 37 87 / .06)" strokeDasharray="2 4" />
          {data.map((s, i) => (
            <Wedge key={s.type} slice={s} i={i} n={data.length} r={radius(s.count)} active={hover === s.type} dim={!!hover && hover !== s.type}
              onHover={setHover} onClick={() => router.push(`/findings?type=${s.type}`)} />
          ))}
          <circle cx={C} cy={C} r={15} fill="#fff" stroke="rgb(15 37 87 / .06)" />
          <text x={C} y={C + 4} textAnchor="middle" className="fill-foreground text-[12px] font-semibold tabular">{total}</text>
        </svg>
        <ul className="grid w-full gap-0.5" aria-label="Findings by category">
          {data.map((s) => (
            <li key={s.type}>
              <Link href={`/findings?type=${s.type}`} onMouseEnter={() => setHover(s.type)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.type)} onBlur={() => setHover(null)}
                className={cn("press flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[12.5px] transition-[background-color,opacity]",
                  hover === s.type && "bg-white/75 font-medium", hover && hover !== s.type && "opacity-50")}>
                <i className="size-2 rounded-full" style={{ background: COLOR[s.type] }} />
                <span className="flex-1 truncate">{s.label}</span>
                {s.high > 0 && <span className="rounded-md bg-urgent/10 px-1 text-[10px] font-semibold text-urgent">{s.high} high</span>}
                <span className="w-9 text-right text-muted-foreground tabular">{Math.round((s.count / total) * 100)}%</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>}
    </Card>
  )
}
