"use client"
// Test runs ledger (PORTING_PLAN.md P1.4, from trevyn-app Runs.jsx Runs + Overview RunsTable).
// Reads runs from the live store; honours ?run=, ?suite= and ?date= links from the Overview.
import { api, apiEnabled, type ApiRun, type Items } from "@/lib/api"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { CirclePlay, Plus, X } from "lucide-react"
import { DurBar, Gantt, ResultBar, secs } from "@/components/charts/timing"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { PageHeader } from "@/components/kit/page-header"
import { Legend, Pill, RunStatusPill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import type { getRunLedger } from "@/lib/data"
import { PHASES, TRIGGER_TONE } from "@/lib/demo/runs"
import { shortDate } from "@/components/kit/controls"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"

type Ledger = Awaited<ReturnType<typeof getRunLedger>>
type Filters = { run?: string | null; suite?: string | null; date?: string | null }

export function RunsWithParams({ ledger }: { ledger: Ledger }) {
  const q = useSearchParams()
  return <RunsView ledger={ledger} filters={{ run: q.get("run"), suite: q.get("suite"), date: q.get("date") }} />
}

export function RunsView({ ledger, filters = {} }: { ledger: Ledger; filters?: Filters }) {
  const router = useRouter()
  const runs = useLive((s) => s.runs)
  const live = useLive((s) => s.run)
  const [apiRuns, setApiRuns] = useState<ApiRun[] | null>(null)
  const [refreshError, setRefreshError] = useState("")
  useEffect(() => {
    if (!apiEnabled) return
    let mounted = true
    const refresh = () => api<Items<ApiRun>>("/api/runs?limit=100")
      .then(({ items }) => { if (mounted) { setApiRuns(items); setRefreshError("") } })
      .catch((e: Error) => { if (mounted) setRefreshError(e.message) })
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 3000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])
  const rows = (apiEnabled ? apiRuns ?? [] : runs.map((r) => (live?.id === r.id && r.status === "running" ? { ...r, passed: live.done } : r)))
    .filter((r) => !filters.suite || r.name.toLowerCase().includes(filters.suite.toLowerCase()))
  const maxD = Math.max(...rows.map((r) => secs(r.duration)), 1)
  const chips = [filters.suite && `Suite: ${filters.suite}`, filters.date && `Day: ${shortDate(filters.date)} (demo shows today's ledger)`].filter(Boolean)

  return (
    <div className="grid gap-3.5">
      <PageHeader title="Test runs" sub="Every run keeps one context and one evidence trail, from plan to regression.">
        <Legend className="mr-2 hidden lg:inline-flex" />
        <Button variant="glass" size="pill" render={<Link href="/runs/live" />}><CirclePlay />Watch live run</Button>
        <Button variant="brand" size="pill" render={<Link href="/runs/new" />}><Plus />New test run</Button>
      </PageHeader>
      {!apiEnabled && <StatStrip items={ledger.kpis} />}
      {refreshError && <p role="alert" className="text-sm text-bad">Could not refresh runs: {refreshError}</p>}

      <Card flush title="Run ledger" caption={apiEnabled ? `${rows.length} runs · refreshes every 3 seconds` : "Duration bars share one scale"}
        extra={chips.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => <Pill key={c as string} tone="brand">{c}</Pill>)}
            <Link href="/runs" className="press grid size-6 place-items-center rounded-full hover:bg-white/70" aria-label="Clear filters"><X size={13} /></Link>
          </span>
        )}>
        <DataTable head={["Run", "Status", "Pass / fail", "Duration", "Trigger", "Started"]} minWidth={760}>
          {rows.map((r) => {
            const href = apiEnabled ? `/runs/live?run=${encodeURIComponent(r.uuid ?? r.id)}` : r.status === "running" ? "/runs/live" : "/findings/DEF-142"
            return (
              <Row key={r.uuid ?? r.id} onClick={() => router.push(href)} highlight={filters.run === r.id}>
                <Cell>
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="block">
                    <span className="block font-mono text-[11px] text-muted-foreground">{r.id}</span>
                    <span className="font-medium">{r.name}</span>
                  </Link>
                </Cell>
                <Cell><RunStatusPill s={r.status} /></Cell>
                <Cell><ResultBar p={r.passed} t={r.total} st={r.status} /></Cell>
                <Cell>{r.status === "running" ? <span className="font-mono text-[11.5px] text-det">in progress</span> : <DurBar d={r.duration} max={maxD} />}</Cell>
                <Cell><span className={cn("font-mono text-[11.5px]", TRIGGER_TONE[r.trigger] ?? "text-muted-foreground")}>{r.trigger}</span></Cell>
                <Cell className="font-mono text-[11.5px] whitespace-nowrap text-muted-foreground">{apiEnabled ? new Date(r.started).toLocaleString() : r.started}</Cell>
              </Row>
            )
          })}
          {rows.length === 0 && <Row><Cell colSpan={6} className="py-8 text-center text-muted-foreground">{apiEnabled && !apiRuns ? "Loading runs…" : "No runs match this filter."}</Cell></Row>}
        </DataTable>
      </Card>

      {!apiEnabled && <Card title="Run timeline · last 6 completed runs" extra={<span className="font-mono text-[11px] text-muted-foreground">phases on a 0–13 min axis</span>}>
        <Gantt rows={ledger.timeline} phases={PHASES} max={780} ticks={[0, 120, 240, 360, 480, 600, 720]} />
      </Card>}
    </div>
  )
}
