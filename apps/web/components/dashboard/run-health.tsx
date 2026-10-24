"use client"
// Run health (DASHBOARD_DESIGN_SPEC.md §4.5): passed vs failed tests as two lines with runs/day as faint
// volume bars along the floor. Legend chips toggle a series on click and dim the other on hover.
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import type { RunHealthPoint } from "@/lib/types"
import { Card, GlassTooltip, RangeToggle, shortDate } from "./bits"
import { cn } from "@/lib/utils"

const config = {
  passed: { label: "Tests passed", color: "var(--det)" },
  failed: { label: "Tests failed", color: "var(--bad)" },
  runs: { label: "Runs", color: "var(--muted-foreground)" },
} satisfies ChartConfig
type Series = "passed" | "failed"

export function RunHealth({ data }: { data: RunHealthPoint[] }) {
  const router = useRouter()
  const [range, setRange] = useState<"7d" | "30d">("30d")
  const [hidden, setHidden] = useState<Record<Series, boolean>>({ passed: false, failed: false })
  const [focus, setFocus] = useState<Series | null>(null)
  const rows = useMemo(() => (range === "7d" ? data.slice(-7) : data), [data, range])
  const maxRuns = Math.max(1, ...rows.map((r) => r.runs))
  const maxFailed = Math.max(1, ...rows.map((r) => r.failed))
  const hasResults = rows.some((r) => r.runs || r.passed || r.failed)
  const op = (s: Series) => (hidden[s] ? 0 : focus && focus !== s ? 0.22 : 1)

  return (
    <Card title="Test health" caption={`${rows.length} days`}
      extra={<RangeToggle id="health" value={range} options={["7d", "30d"]} onChange={setRange} />} className="overview-chart h-full">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(["passed", "failed"] as const).map((s) => (
          <button key={s} onClick={() => setHidden((h) => ({ ...h, [s]: !h[s] }))} onMouseEnter={() => setFocus(s)} onMouseLeave={() => setFocus(null)}
            aria-pressed={!hidden[s]}
            className={cn("press glass-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-opacity", hidden[s] && "opacity-40")}>
            <i className="h-0.5 w-3 rounded-full" style={{ background: config[s].color }} />{config[s].label}
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5 px-1.5 text-[11.5px] text-muted-foreground"><i className="h-2.5 w-1 rounded-sm bg-muted-foreground/30" />Runs per day</span>
      </div>
      {!hasResults ? <div className="flex h-[230px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-center text-[13px] text-muted-foreground">No test history</div> : <ChartContainer config={config} className="aspect-auto h-[230px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: -4, left: -12, bottom: 0 }}
          onClick={(e) => { const d = rows[Number(e?.activeTooltipIndex)]; if (d) router.push(`/runs?date=${d.date}`) }}>
          <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
          <YAxis yAxisId="t" tickLine={false} axisLine={false} width={40} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 4)]} />
          <YAxis yAxisId="f" orientation="right" tickLine={false} axisLine={false} width={34} tick={{ fill: "var(--bad)" }}
            domain={[-maxFailed * 0.8, maxFailed * 1.15]} ticks={[...new Set([0, Math.round(maxFailed / 2), maxFailed])]} />
          <YAxis yAxisId="r" hide domain={[0, maxRuns * 6]} />
          <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }}
            content={(p) => <GlassTooltip {...p} labelFormat={shortDate} rows={{ passed: "Passed", failed: "Failed", runs: "Runs" }} />} />
          <Bar yAxisId="r" dataKey="runs" fill="var(--color-runs)" fillOpacity={0.22} radius={2} barSize={range === "7d" ? 14 : 5} animationDuration={600} />
          <Line yAxisId="t" dataKey="passed" type="linear" stroke="var(--color-passed)" strokeWidth={2} dot={false} strokeOpacity={op("passed")}
            activeDot={hidden.passed ? false : { r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
          <Line yAxisId="f" dataKey="failed" type="linear" stroke="var(--color-failed)" strokeWidth={2} dot={false} strokeOpacity={op("failed")}
            activeDot={hidden.failed ? false : { r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
        </ComposedChart>
      </ChartContainer>}
    </Card>
  )
}
