"use client"
// Five KPI cards (DASHBOARD_DESIGN_SPEC.md §4.4) in glass: chip + title + caption, light count-up value,
// delta pill whose colour follows the metric's good direction. Whole card is a link; hover lifts.
import Link from "next/link"
import { motion } from "motion/react"
import { CircleCheck, Ellipsis, FlaskConical, Inbox, ShieldCheck, Bug, type LucideIcon } from "lucide-react"
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

function KpiCard({ k }: { k: Kpi }) {
  const { icon: Icon, chip, edge } = META[k.key]
  const good = k.goodDirection === "up" ? k.delta >= 0 : k.delta <= 0
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <Link href={k.href} aria-label={`${k.label}: ${k.value}${k.unit ?? ""}`}
        className={cn("group glass-1 spot pulse flex flex-col rounded-[20px] p-4 transition-[box-shadow,border-color] hover:shadow-(--shadow-float)", edge)}>
        <div className="flex items-start gap-2.5">
          <span className={cn("grid size-8 place-items-center rounded-[11px] transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6", chip)}><Icon size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{k.label}</div>
            <div className="text-[10.5px] text-muted-foreground">vs last 30 days</div>
          </div>
          <Ellipsis size={16} className="text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-4 flex items-end justify-between gap-2">
          <CountUp value={k.value} decimals={k.unit === "%" ? 1 : 0} suffix={k.unit ?? ""} className="text-[28px] leading-none font-light tracking-[-.02em] tabular" />
          <span title={`${k.delta > 0 ? "+" : ""}${k.delta}${k.deltaUnit === "pts" ? " points" : "%"} vs the previous 30 days`}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", good ? "bg-ok/12 text-ok" : "bg-bad/12 text-bad")}>
            <i className="size-1.5 rounded-full bg-current" />{k.delta > 0 ? "+" : ""}{k.delta}{k.deltaUnit === "pts" ? " pts" : "%"}
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  const pending = useLive((s) => s.approvals.length)
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpis.map((k) => <KpiCard key={k.key} k={k.key === "pending_approvals" ? { ...k, value: pending } : k} />)}
    </div>
  )
}
