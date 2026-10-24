"use client"

import Link from "next/link"
import { ArrowRight, ArrowUpRight, FlaskConical } from "lucide-react"
import { RUN_STATUS } from "@/components/kit/pills"
import { useLive } from "@/lib/live"
import type { FindingType, RunSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPE: Record<FindingType, string> = { ui: "Browser & UI", api: "API", perf: "Performance", security: "Security", accessibility: "Accessibility", compat: "Compatibility" }
type DashboardRun = RunSummary & { uuid?: string; state?: string }

function started(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC"
}

export function ActiveRuns({ live = false }: { live?: boolean }) {
  const runs: DashboardRun[] = useLive((s) => s.runs)
  const demoRun = useLive((s) => s.run)
  return (
    <section className="overview-runs" aria-labelledby="recent-runs-title">
      <header className="flex items-start justify-between gap-3 p-5">
        <h2 id="recent-runs-title" className="text-[15px] font-semibold">Recent runs</h2>
        <Link href="/runs" className="overview-text-link shrink-0">All runs<ArrowUpRight size={13} /></Link>
      </header>
      {runs.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[12px]">
          <thead><tr className="border-y border-border bg-muted/40 text-[10px] font-medium text-muted-foreground"><th scope="col" className="px-5 py-2.5 font-medium">Run / test type</th><th scope="col" className="px-3 py-2.5 font-medium">Status</th><th scope="col" className="px-3 py-2.5 font-medium">Passed</th><th scope="col" className="px-5 py-2.5 text-right font-medium">Duration</th></tr></thead>
          <tbody>{runs.slice(0, 5).map((run, i) => {
            const [pill, label] = RUN_STATUS[run.status]
            const count = !live && demoRun?.id === run.id && run.status === "running" ? demoRun.done : run.passed
            const href = live ? `/runs/live?run=${encodeURIComponent(run.uuid ?? run.id)}` : run.status === "running" ? "/runs/live" : `/runs?run=${encodeURIComponent(run.id)}`
            return <tr key={run.uuid ?? `${run.id}-${i}`} className="group border-b border-border last:border-0 hover:bg-brand/[.025]">
              <td className="max-w-[240px] py-3.5 pr-3 pl-5"><Link href={href} className="block truncate font-medium hover:text-brand">{run.name}</Link><div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="font-mono">{run.id}</span><span>·</span>{TYPE[run.type]}</div><time className="mt-0.5 block text-[10px] text-muted-foreground">{started(run.started)}</time></td>
              <td className="px-3 py-3.5"><span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium", pill)}>{run.status === "running" && <i className="size-1.5 rounded-full bg-current" />}{run.state === "AWAITING_APPROVAL" ? "Awaiting approval" : label}</span></td>
              <td className="px-3 py-3.5 font-mono text-[11px] tabular">{count}<span className="text-muted-foreground"> / {run.total}</span></td>
              <td className="px-5 py-3.5 text-right"><Link href={href} aria-label={`Open ${run.id}`} className="inline-flex items-center gap-3 text-[11px] text-muted-foreground hover:text-brand">{run.duration}<ArrowUpRight size={13} /></Link></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="flex min-h-[180px] flex-col items-center justify-center px-6 py-8 text-center"><span className="overview-empty-icon"><FlaskConical size={21} /></span><h3 className="mt-3 text-[13px] font-semibold">No test runs</h3><Link href="/runs/new" className="overview-text-link mt-4">New test run<ArrowRight size={13} /></Link></div>}
    </section>
  )
}
