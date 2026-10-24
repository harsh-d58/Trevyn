"use client"
// Active runs as folder-tab cards (GLASS_DESIGN_LANGUAGE.md C.11): a pastel tab strip by test type that
// lifts like a pulled folder tab on hover. Reads the store, so the live card follows the scripted run.
import Link from "next/link"
import { motion } from "motion/react"
import { Avatar } from "@/components/kit/pills"
import { RUN_STATUS } from "@/components/kit/pills"
import { useLive } from "@/lib/live"
import type { FindingType, RunStatus, RunSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const TAB: Record<FindingType, [string, string]> = {
  ui: ["#dce6ff", "UI"], api: ["#d9f1ff", "API"], perf: ["#ffe6d6", "Performance"], security: ["#ffe1ee", "Security"], compat: ["#e6ebf2", "Compat"],
}
const BAR: Record<RunStatus, string> = { running: "var(--det)", passed: "var(--ok)", failed: "var(--bad)", warn: "var(--warn)", stopped: "var(--muted-foreground)" }

/** API runs carry an ISO timestamp; demo runs carry display text ("Just now") */
const when = (s: string) => {
  const d = new Date(s)
  return /^\d{4}-/.test(s) && !isNaN(+d) ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : s
}

function FolderCard({ run }: { run: RunSummary }) {
  const [tint, type] = TAB[run.type]
  const [pill, label] = RUN_STATUS[run.status]
  return (
    <Link href={run.uuid ? `/runs/live?run=${run.uuid}` : run.status === "running" ? "/runs/live" : `/runs?run=${run.id}`} className="press group block">
      <motion.div className="flex items-center justify-between rounded-t-[18px] px-4 pt-2.5 pb-5 text-[11.5px] font-medium text-[#33405e]"
        style={{ background: tint }} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 400, damping: 26 }}>
        <span suppressHydrationWarning>{when(run.started)}</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10.5px] font-semibold">{run.trigger}</span>
      </motion.div>
      <div className="glass-1 spot -mt-3 rounded-[18px] p-4 transition-shadow group-hover:shadow-(--shadow-float)">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-muted-foreground">{run.id} · {type}</div>
            <div className="mt-0.5 truncate text-[13.5px] font-semibold">{run.name}</div>
          </div>
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", pill)}>
            {run.status === "running" && <i className="live-dot size-1.5 rounded-full bg-current" />}{label}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[.05]">
            <motion.div className="h-full rounded-full" style={{ background: BAR[run.status] }} initial={{ width: 0 }}
              animate={{ width: `${(run.passed / run.total) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} />
          </div>
          <span className="text-[12px] font-medium tabular">{run.passed}/{run.total}</span>
          <span className="flex -space-x-1.5">{run.people.map((p) => <Avatar key={p} k={p} size={24} />)}</span>
        </div>
      </div>
    </Link>
  )
}

export function ActiveRuns() {
  const runs = useLive((s) => s.runs)
  const live = useLive((s) => s.run)
  const real = useLive((s) => s.source) === "live"
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Active runs</h2>
          <p className="text-[11.5px] text-muted-foreground">{real ? "Latest runs across all projects" : "Today across ShopFlow"} · tab colour = test type</p>
        </div>
        <Link href="/runs" className="text-[12px] font-medium text-brand hover:underline">All runs</Link>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {runs.slice(0, 4).map((r) => <FolderCard key={r.uuid ?? r.id} run={live?.id === r.id && r.status === "running" ? { ...r, passed: live.done } : r} />)}
      </div>
    </section>
  )
}
