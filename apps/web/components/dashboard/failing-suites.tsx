"use client"
// Top failing suites (DASHBOARD_DESIGN_SPEC.md §4.7): bars fill on mount; row hover thickens the bar and
// slides in a chevron.
import Link from "next/link"
import { motion } from "motion/react"
import { ChevronRight, CreditCard, KeyRound, LayoutGrid, ShoppingCart } from "lucide-react"
import type { SuiteFailure } from "@/lib/types"
import { Card } from "./bits"

const ICON = { cart: ShoppingCart, key: KeyRound, grid: LayoutGrid, card: CreditCard }
const TONE = { bad: "var(--bad)", perf: "var(--cat-perf)", ai: "var(--ai)", ui: "var(--cat-ui)" }

export function FailingSuites({ data }: { data: SuiteFailure[] }) {
  return (
    <Card title="Top failing suites" caption="Share of failed tests · 30 days" className="h-full">
      <ul className="-mx-2 grid gap-1">
        {data.map((s, i) => {
          const Icon = ICON[s.icon]
          return (
            <li key={s.suite}>
              <Link href={`/runs?suite=${s.suite.toLowerCase()}`} className="press pulse group flex flex-col gap-2 rounded-2xl px-2 py-2 transition-colors hover:bg-white/65">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${TONE[s.tone]} 14%, transparent)`, color: TONE[s.tone] }}>
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{s.suite}</span>
                  <span className="text-[12px] text-muted-foreground tabular"><b className="font-semibold text-foreground">{s.failures}</b> failures ({s.share}%)</span>
                  <ChevronRight size={15} className="-mr-1 -translate-x-1 text-muted-foreground opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-black/[.05] transition-[height] group-hover:h-1.5">
                  <motion.div className="h-full rounded-full" style={{ background: TONE[s.tone] }}
                    initial={{ width: 0 }} whileInView={{ width: `${(s.share / data[0].share) * 100}%` }} viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
