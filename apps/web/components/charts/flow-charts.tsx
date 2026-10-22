"use client"
// Sankey (from icharts.jsx) and Recharts-based TrendLine / StackedArea / Histogram (replacing the
// prototype's hand-rolled LineChart, StackedArea and Histogram) with the shared glass tooltip.
import { motion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { GlassTooltip } from "@/components/kit/controls"

const halo = { paintOrder: "stroke", stroke: "#f4f6fa", strokeWidth: 4, strokeLinejoin: "round" } as const

export type SankeyNode = { id: string; label: string; v: number; c: string }
/** cols = [[node]], links = [{s,t,v}]. One value scale for every node and ribbon. */
export function Sankey({ cols, links, h = 280, nodeW = 12, R = 128, gap = 14 }: { cols: SankeyNode[][]; links: { s: string; t: string; v: number }[]; h?: number; nodeW?: number; R?: number; gap?: number }) {
  // drawn at the measured width so labels stay page-sized
  const ref = useRef<HTMLDivElement>(null)
  const [mw, setMw] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setMw(Math.round(e.contentRect.width) || 720))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const w = Math.max(560, mw)
  const T = 8, B = 8, L = 6, max = Math.max(...cols.map((c) => c.reduce((a, n) => a + n.v, 0)))
  const most = Math.max(...cols.map((c) => c.length)), k = (h - T - B - gap * (most - 1)) / max
  const N: Record<string, SankeyNode & { x: number; y: number; hh: number }> = {}
  cols.forEach((col, ci) => { let y = T; col.forEach((n) => { N[n.id] = { ...n, x: L + (ci * (w - L - R - nodeW)) / (cols.length - 1), y, hh: n.v * k }; y += n.v * k + gap }) })
  const ls = links.map((l) => ({ ...l, a: N[l.s], b: N[l.t] }))
  const out: Record<string, number> = {}, inn: Record<string, number> = {}
  const so = new Map<(typeof ls)[number], number>(), to = new Map<(typeof ls)[number], number>()
  ;[...ls].sort((p, q) => p.b.y - q.b.y).forEach((l) => { const o = out[l.s] ?? 0; out[l.s] = o + l.v * k; so.set(l, o) })
  ;[...ls].sort((p, q) => p.a.y - q.a.y).forEach((l) => { const o = inn[l.t] ?? 0; inn[l.t] = o + l.v * k; to.set(l, o) })
  return (
    <div ref={ref} className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block" role="img" aria-label="Finding flow">
        {ls.map((l, i) => {
          const th = l.v * k, x0 = l.a.x + nodeW, x1 = l.b.x, xm = (x0 + x1) / 2, y0 = l.a.y + so.get(l)!, y1 = l.b.y + to.get(l)!
          return (
            <g key={i}>
              <motion.path d={`M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + th} C${xm},${y1 + th} ${xm},${y0 + th} ${x0},${y0 + th} Z`}
                fill={l.b.c} fillOpacity=".2" stroke={l.b.c} strokeOpacity=".35" strokeWidth=".6"
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.05 }}>
                <title>{`${l.a.label} → ${l.b.label}: ${l.v}`}</title>
              </motion.path>
              <text x={xm} y={(y0 + y1) / 2 + th / 2 + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--muted-foreground)" style={{ ...halo, fontFamily: "var(--font-mono), monospace" }}>{l.v}</text>
            </g>
          )
        })}
        {Object.values(N).map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={nodeW} height={Math.max(n.hh, 2)} rx="3" fill={n.c} />
            <text x={n.x + nodeW + 6} y={n.y + n.hh / 2 + 4} fontSize="11.5" fill="var(--foreground)" style={halo}>
              <tspan fontWeight="600">{n.label}</tspan><tspan dx="5" fill="var(--muted-foreground)" style={{ fontFamily: "var(--font-mono), monospace" }}>{n.v}</tspan>
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/** single series on one linear scale with an optional threshold line */
export function TrendLine({ vals, labels, min, max, step, unit = "", thr, thrL, color = "var(--brand)", h = 190, name = "Value" }: {
  vals: number[]; labels: string[]; min: number; max: number; step: number; unit?: string; thr?: number; thrL?: string; color?: string; h?: number; name?: string
}) {
  const gid = useId().replace(/:/g, "")
  const data = vals.map((v, i) => ({ l: labels[i], v }))
  const ticks: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(2))
  const config = { v: { label: name, color } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: h }}>
      <AreaChart data={data} margin={{ top: 14, right: 12, left: -6, bottom: 0 }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.16} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={6} minTickGap={20} />
        <YAxis domain={[min, max]} ticks={ticks} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}${unit}`} allowDataOverflow />
        <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} content={(p) => <GlassTooltip {...p} rows={{ v: name }} />} />
        {thr != null && <ReferenceLine y={thr} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: thrL, position: "insideTopRight", fill: "var(--bad)", fontSize: 10.5 }} />}
        <Area dataKey="v" type="monotone" stroke={color} strokeWidth={2.2} fill={`url(#${gid})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={800} />
      </AreaChart>
    </ChartContainer>
  )
}

/** stacked series on one shared y scale */
export function StackedArea({ series, labels, max, step, h = 210, unit = "" }: { series: { k: string; c: string; vals: number[] }[]; labels: string[]; max: number; step: number; h?: number; unit?: string }) {
  const data = labels.map((l, i) => Object.fromEntries([["l", l], ...series.map((s, j) => [`s${j}`, s.vals[i]])]))
  const config = Object.fromEntries(series.map((s, j) => [`s${j}`, { label: s.k, color: s.c }])) satisfies ChartConfig
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return (
    <>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: h }}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
          <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={6} minTickGap={28} />
          <YAxis domain={[0, max]} ticks={ticks} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}${unit}`} />
          <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} content={(p) => <GlassTooltip {...p} rows={Object.fromEntries(series.map((s, j) => [`s${j}`, s.k]))} />} />
          {series.map((s, j) => <Area key={s.k} dataKey={`s${j}`} stackId="a" type="monotone" stroke={s.c} strokeWidth={1.8} fill={s.c} fillOpacity={0.22} animationDuration={700} />)}
        </AreaChart>
      </ChartContainer>
      <div className="mt-1 flex flex-wrap gap-3">{series.map((s) => <span key={s.k} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><i className="size-2.5 rounded-sm" style={{ background: s.c }} />{s.k}</span>)}</div>
    </>
  )
}

/** latency histogram with percentile markers on the bucket scale; hot buckets in --bad */
export function Histogram({ buckets, marks = [], h = 200 }: { buckets: [string, number, (0 | 1)?][]; marks?: [string, number, string][]; h?: number }) {
  const data = buckets.map(([l, v, hot]) => ({ l, v, hot: !!hot }))
  const config = { v: { label: "Requests", color: "var(--brand)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: h }}>
      <BarChart data={data} margin={{ top: 22, right: 10, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={6} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: "rgb(15 37 87 / .05)" }} content={(p) => <GlassTooltip {...p} labelFormat={(l) => `≤ ${l} ms`} rows={{ v: "Requests" }} />} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} animationDuration={700}>
          {data.map((d) => <Cell key={d.l} fill={d.hot ? "var(--bad)" : "var(--brand)"} fillOpacity={d.hot ? 0.75 : 0.7} />)}
        </Bar>
        {marks.map(([lab, i, c]) => <ReferenceLine key={lab} x={buckets[Math.floor(i)][0]} stroke={c} strokeDasharray="3 3" strokeWidth={1.5} label={{ value: lab, position: "top", fill: c, fontSize: 10.5, fontWeight: 600 }} />)}
      </BarChart>
    </ChartContainer>
  )
}

/** single-series line used for VU curves (no fill) */
export function PlainLine({ vals, labels, max, color, h = 120, name, thr, thrL }: { vals: number[]; labels: string[]; max: number; color: string; h?: number; name: string; thr?: number; thrL?: string }) {
  const data = vals.map((v, i) => ({ l: labels[i], v }))
  return (
    <ChartContainer config={{ v: { label: name, color } }} className="aspect-auto w-full" style={{ height: h }}>
      <LineChart data={data} margin={{ top: 14, right: 12, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} tickMargin={6} />
        <YAxis domain={[0, max]} tickLine={false} axisLine={false} width={44} />
        <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} content={(p) => <GlassTooltip {...p} rows={{ v: name }} />} />
        {thr != null && <ReferenceLine y={thr} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: thrL, position: "insideTopLeft", fill: "var(--bad)", fontSize: 10.5 }} />}
        <Line dataKey="v" type="monotone" stroke={color} strokeWidth={2.2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={800} />
      </LineChart>
    </ChartContainer>
  )
}
