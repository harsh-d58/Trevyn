"use client"
// Evidence throughput (DASHBOARD_DESIGN_SPEC.md §4.9): screenshots, traces and network logs captured per
// day as a sharp-edged area, with the peak day pinned like Coinly's cash-flow callout.
import { useId, useMemo, useState } from "react"
import { Area, AreaChart, ReferenceDot, Tooltip, XAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { CountUp } from "@/components/fx/numbers"
import type { ThroughputPoint } from "@/lib/types"
import { Card, GlassTooltip, shortDate } from "./bits"

const config = { evidence: { label: "Evidence items", color: "var(--brand)" } } satisfies ChartConfig

function PeakLabel({ viewBox, text, dim }: { viewBox?: { x?: number; y?: number }; text: string; dim: boolean }) {
  const x = viewBox?.x ?? 0, y = viewBox?.y ?? 0, w = 104
  return (
    <g style={{ opacity: dim ? 0.35 : 1, transition: "opacity .2s" }} className="[animation:slidein_.4s_.7s_both]">
      <rect x={x - w / 2} y={y - 40} width={w} height={28} rx={9} fill="rgb(255 255 255 / .92)" stroke="rgb(15 37 87 / .08)" />
      <text x={x} y={y - 22} textAnchor="middle" className="fill-foreground text-[10.5px] font-semibold">{text}</text>
    </g>
  )
}

export function Throughput({ data }: { data: ThroughputPoint[] }) {
  const gid = useId().replace(/:/g, "")
  const [hovering, setHovering] = useState(false)
  const total = useMemo(() => data.reduce((a, d) => a + d.evidence, 0), [data])
  const peak = useMemo(() => data.reduce((m, d) => (d.evidence > m.evidence ? d : m), data[0]), [data])

  return (
    <Card title="Evidence captured" caption="Screenshots, traces and network logs · 30 days" className="h-full">
      <div className="flex items-baseline gap-2">
        <CountUp value={total} className="text-[24px] leading-none font-light tracking-[-.02em] tabular" />
        <span className="text-[11.5px] text-muted-foreground">items</span>
      </div>
      <ChartContainer config={config} className="mt-2 aspect-auto h-[170px] w-full">
        <AreaChart data={data} margin={{ top: 46, right: 8, left: 8, bottom: 0 }}
          onMouseMove={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-evidence)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-evidence)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={6} minTickGap={36} tickFormatter={shortDate} />
          <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }}
            content={(p) => <GlassTooltip {...p} labelFormat={shortDate} rows={{ evidence: "Evidence items" }} />} />
          <Area dataKey="evidence" type="linear" stroke="var(--color-evidence)" strokeWidth={1.75} fill={`url(#${gid})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={800} />
          <ReferenceDot x={peak.date} y={peak.evidence} r={4} fill="var(--color-evidence)" stroke="#fff" strokeWidth={2}
            label={<PeakLabel text={`${shortDate(peak.date)} · ${peak.evidence}`} dim={hovering} />} />
        </AreaChart>
      </ChartContainer>
    </Card>
  )
}
