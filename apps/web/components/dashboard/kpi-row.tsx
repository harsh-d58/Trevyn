"use client"
// Five KPI cards (DASHBOARD_DESIGN_SPEC.md §4.4) in glass: chip + title + caption, light count-up value,
// delta pill whose colour follows the metric's good direction. Whole card is a link; hover lifts.
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowDownRight, ArrowUpRight, CircleCheck, FlaskConical, Inbox, ShieldCheck, Bug, type LucideIcon } from "lucide-react"
import { CountUp } from "@/components/fx/numbers"
import { useLive } from "@/lib/live"
import type { Kpi, KpiKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const META: Record<KpiKey, { icon: LucideIcon; chip: string; edge: string }> = {
  tests_executed: { icon: FlaskConical, chip: "bg-det/12 text-det", edge: "hover:border-det/30" },
  pass_rate: { icon: CircleCheck, chip: "bg-ok/12 text-ok", edge: "hover:border-ok/30" },
  confirmed_findings: { icon: Bug, chip: "bg-bad/12 text-bad", edge: "hover:border-bad/30" },
  regressions_prevented: { icon: ShieldCheck, chip: "bg-ai/12 text-ai", edge: "hover:border-ai/30" },
  pending_approvals: { icon: Inbox, chip: "bg-human/12 text-human", edge: "hover:border-human/30" },
}

function KpiCard({ k, live }: { k: Kpi; live: boolean }) {
  const { icon: Icon, chip, edge } = META[k.key]
  const good = k.goodDirection === "up" ? k.delta >= 0 : k.delta <= 0
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <Link href={k.href} aria-label={`${k.label}: ${k.value}${k.unit ?? ""}`}
        className={cn("overview-kpi group flex h-full flex-col p-4 transition-[box-shadow,border-color]", edge)}>
        <div className="flex items-start gap-2.5">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-[9px]", chip)}><Icon size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium leading-snug">{k.label}</div>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-2">
          <CountUp value={k.value} decimals={k.unit === "%" ? 1 : 0} suffix={k.unit ?? ""} className="text-[30px] leading-none font-medium tracking-[-.035em] tabular" />
          {k.key !== "pending_approvals" && <span title={`${k.delta > 0 ? "+" : ""}${k.delta}${k.deltaUnit === "pts" ? " points" : "%"} vs the previous ${live ? 7 : 30} days`}
            className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium", k.delta === 0 ? "bg-muted text-muted-foreground" : good ? "bg-ok/8 text-ok" : "bg-bad/8 text-bad")}>
            {k.delta !== 0 && (k.delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}{k.delta > 0 ? "+" : ""}{k.delta}{k.deltaUnit === "pts" ? " pts" : "%"}
          </span>}
        </div>
      </Link>
    </motion.div>
  )
}

export function KpiRow({ kpis, live = false }: { kpis: Kpi[]; live?: boolean }) {
  const pending = useLive((s) => s.approvals.length)
  return (
    <div className="overview-kpis grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpis.map((k) => <KpiCard key={k.key} live={live} k={k.key === "pending_approvals" ? { ...k, value: pending } : k} />)}
    </div>
  )
}
