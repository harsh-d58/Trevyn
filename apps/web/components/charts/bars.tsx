"use client"
// Bar-family charts ported from trevyn-app qcharts.jsx / icharts.jsx / Network.jsx:
// DotRange, StackBars, Donut (merged), RiskScatter. Every chart uses one linear scale with labelled ticks.
import { motion } from "motion/react"
import { Fragment, useEffect, useRef, useState } from "react"
import { MonoLabel } from "@/components/kit/pills"
import { cn } from "@/lib/utils"

/** measured container width, so SVG charts draw in real pixels and keep page-sized text */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, w] as const
}

const ticksOf = (max: number, step: number) => { const t: number[] = []; for (let v = 0; v <= max + 1e-9; v += step) t.push(+v.toFixed(2)); return t }
const pc = (v: number, max: number) => `${(v / max) * 100}%`

function Axis({ T, max, unit, lw }: { T: number[]; max: number; unit: string; lw: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `${lw}px 1fr` }}><span />
      <div className="relative h-4">{T.map((t) => <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground tabular first:translate-x-0 last:-translate-x-full" style={{ left: pc(t, max) }}>{t}{t === max ? unit : ""}</span>)}</div>
    </div>
  )
}
const Grid = ({ T, max }: { T: number[]; max: number }) => <>{T.slice(1, -1).map((t) => <i key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: pc(t, max) }} />)}</>

/** p50 → p95 dot-range per row on one shared ms scale, with an SLO line */
export function DotRange({ rows, max, step, thr, thrL, unit = " ms", lw = 170 }: { rows: [string, number, number][]; max: number; step: number; thr?: number; thrL?: string; unit?: string; lw?: number }) {
  const T = ticksOf(max, step)
  return (
    <div className="overflow-x-auto"><div className="min-w-[500px]">
      <div className="grid gap-3 border-b border-border pb-1.5" style={{ gridTemplateColumns: `${lw}px 1fr` }}><MonoLabel>Endpoint</MonoLabel>
        <div className="relative h-4">{T.map((t) => <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground tabular first:translate-x-0 last:-translate-x-full" style={{ left: pc(t, max) }}>{t}{t === max ? unit : ""}</span>)}</div>
      </div>
      {rows.map(([l, a, b], i) => {
        const over = thr != null && b > thr
        return (
          <div key={l} className="grid items-center gap-3 border-b border-border/60 py-[7px] last:border-0" style={{ gridTemplateColumns: `${lw}px 1fr` }}>
            <span className={cn("truncate font-mono text-[11.5px]", over && "text-bad")} title={l}>{l}</span>
            <div className="relative h-5">
              <Grid T={T} max={max} />
              {thr != null && <i className="absolute -inset-y-2 w-0 border-l border-dashed border-bad/70" style={{ left: pc(thr, max) }} />}
              <motion.i className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full", over ? "bg-bad/30" : "bg-brand/25")} style={{ left: pc(a, max) }}
                initial={{ width: 0 }} whileInView={{ width: pc(b - a, max) }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.05 }} />
              <i title={`p50 ${a}${unit}`} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand" style={{ left: pc(a, max) }} />
              <i title={`p95 ${b}${unit}`} className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white", over ? "bg-bad" : "bg-navy")} style={{ left: pc(b, max) }} />
              <span className={cn("absolute top-0.5 pl-2.5 font-mono text-[10.5px] tabular", over ? "font-semibold text-bad" : "text-muted-foreground")} style={{ left: pc(b, max) }}>{b}</span>
            </div>
          </div>
        )
      })}
      <div className="mt-2.5 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-brand" />p50</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-navy" />p95</span>
        {thr != null && <span className="flex items-center gap-1.5 text-bad"><i className="h-3 w-0 border-l border-dashed border-bad" />{thrL}</span>}
      </div>
    </div></div>
  )
}

/** Horizontal stacked bars on one shared scale. rows: [label, values, sub]; keys: [key, label, css colour] */
export function StackBars({ rows, keys, max, step, unit = "", lw = 140 }: { rows: [string, number[], string?][]; keys: [string, string, string][]; max: number; step: number; unit?: string; lw?: number }) {
  const T = ticksOf(max, step)
  return (
    <div className="overflow-x-auto"><div className="min-w-[440px]">
      {rows.map(([l, vals, sub], ri) => {
        const tot = vals.reduce((a, b) => a + b, 0)
        return (
          <div key={l} className="grid items-center gap-3 border-b border-border/60 py-1.5" style={{ gridTemplateColumns: `${lw}px 1fr` }}>
            <div className="min-w-0"><div className="truncate text-[12.5px] font-medium">{l}</div>{sub && <div className="truncate font-mono text-[10.5px] text-muted-foreground">{sub}</div>}</div>
            <div className="relative h-7">
              <Grid T={T} max={max} />
              <motion.div className="absolute inset-y-1.5 left-0 flex overflow-hidden rounded-[4px]" initial={{ width: 0 }} whileInView={{ width: pc(tot, max) }} viewport={{ once: true }} transition={{ duration: 0.6, delay: ri * 0.06 }}>
                {vals.map((v, i) => v ? <i key={i} title={`${keys[i][1]} · ${v}${unit}`} className="h-full border-r-2 border-white last:border-r-0" style={{ width: `${(v / tot) * 100}%`, background: keys[i][2] }} /> : null)}
              </motion.div>
              <span className="absolute top-1.5 pl-2 font-mono text-[11px] font-semibold tabular" style={{ left: pc(tot, max) }}>{tot.toLocaleString()}{unit}</span>
            </div>
          </div>
        )
      })}
      <div className="pt-1.5"><Axis T={T} max={max} unit={unit} lw={lw} /></div>
      <div className="mt-2 flex flex-wrap gap-3">{keys.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><i className="h-2.5 w-4 rounded-sm" style={{ background: c }} />{l}</span>)}</div>
    </div></div>
  )
}

/** [start, length] along the circumference for each segment */
function donutArcs(segs: [string, number, string][], C: number) {
  const tot = segs.reduce((a, s) => a + s[1], 0)
  let off = 0
  return segs.map(([, v]) => { const len = (v / tot) * C, start = off; off += len; return [start, len] as const })
}

/** Donut of counts; segments draw in. segs: [key, value, css colour]; children render in the centre */
export function Donut({ segs, size = 128, sw = 15, children, label = "Share" }: { segs: [string, number, string][]; size?: number; sw?: number; children?: React.ReactNode; label?: string }) {
  const r = (size - sw) / 2, c = size / 2, C = 2 * Math.PI * r
  const arcs = donutArcs(segs, C)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(15 37 87 / .06)" strokeWidth={sw} />
        {segs.map(([k, v, col], i) => {
          const [start, len] = arcs[i]
          return <motion.circle key={k} cx={c} cy={c} r={r} fill="none" stroke={col} strokeWidth={sw} strokeDashoffset={-start}
            initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${Math.max(0, len - 2.5)} ${C}` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.1 }}><title>{`${k}: ${v}`}</title></motion.circle>
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Risk × confidence scatter with a movable autonomy limit on the risk axis */
export function RiskScatter({ pts, thr, thrLabel, h = 250 }: { pts: { id: string; x: number; y: number; auto: boolean }[]; thr: number; thrLabel: string; h?: number }) {
  const [ref, mw] = useWidth<HTMLDivElement>(620)
  const w = Math.max(520, mw), L = 44, R = 16, T = 22, B = 32, x = (v: number) => L + (v / 100) * (w - L - R), y = (v: number) => T + ((100 - v) / 50) * (h - T - B)
  const bands: [string, number, number][] = [["Low risk", 0, 33.3], ["Medium risk", 33.3, 66.7], ["High risk", 66.7, 100]]
  return (
    <div ref={ref} className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block" role="img" aria-label="Generated tests by risk and AI confidence">
        <motion.rect x={L} y={T} height={h - T - B} fill="var(--det)" fillOpacity=".07" animate={{ width: x(thr) - L }} transition={{ type: "spring", stiffness: 160, damping: 22 }} />
        {[50, 75, 100].map((v) => <g key={v}><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)">{v}%</text></g>)}
        {bands.map(([l, a, b], i) => <g key={l}>{i > 0 && <line x1={x(a)} x2={x(a)} y1={T} y2={h - B} stroke="var(--border)" strokeDasharray="2 4" />}<text x={x((a + b) / 2)} y={h - 10} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)">{l}</text></g>)}
        <motion.g animate={{ x: x(thr) }} transition={{ type: "spring", stiffness: 160, damping: 22 }}>
          <line x1={0} x2={0} y1={T - 8} y2={h - B} stroke="var(--human)" strokeWidth="2" strokeDasharray="5 4" />
          <text x={thr > 80 ? -6 : 6} y={T - 9} textAnchor={thr > 80 ? "end" : "start"} fontSize="10.5" fontWeight="600" fill="var(--human)">{thrLabel}</text>
        </motion.g>
        {pts.map((p) => (
          <g key={p.id}>
            <circle cx={x(p.x)} cy={y(p.y)} r="11" fill={p.auto ? "var(--det)" : "var(--human)"} fillOpacity=".14" style={{ transition: "fill .3s" }} />
            <circle cx={x(p.x)} cy={y(p.y)} r="5.5" fill={p.auto ? "var(--det)" : "var(--human)"} stroke="#fff" strokeWidth="2" style={{ transition: "fill .3s" }}><title>{`${p.id} · risk ${p.x} · confidence ${p.y}%`}</title></circle>
            <text x={x(p.x) + 14} y={y(p.y) + 3.5} fontSize="10.5" fill="var(--muted-foreground)" style={{ fontFamily: "var(--font-mono), monospace", paintOrder: "stroke", stroke: "#f4f6fa", strokeWidth: 4 }}>{p.id}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/** Heatmaps: time × latency bucket (share 0..1) and weekday × hour (counts). Rows above `thr` shade in --bad. */
export function LatencyHeatmap({ cols, rows, data, thr, thrL, foot }: { cols: string[]; rows: string[]; data: number[][]; thr: number; thrL: string; foot?: [string, (string | number)[]] }) {
  const m = Math.max(...data.flat())
  const fill = (v: number, hot: boolean) => (v < 0.004 ? "rgb(15 37 87 / .04)" : `color-mix(in srgb, var(${hot ? "--bad" : "--warn"}) ${Math.round(10 + (v / m) * 82)}%, white)`)
  const gc = { gridTemplateColumns: `86px repeat(${cols.length}, minmax(22px, 1fr))` }
  return (
    <div className="overflow-x-auto"><div className="min-w-[480px]">
      <div className="grid gap-[3px]" style={gc}>
        {rows.map((r, ri) => (
          <Fragment key={r}>
            {ri === thr && <div className="col-span-full flex items-center gap-2 py-0.5"><span className="font-mono text-[10px] font-semibold text-bad">{thrL}</span><i className="flex-1 border-t border-dashed border-bad/70" /></div>}
            <span className="self-center pr-1.5 text-right font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">{r}</span>
            {data[ri].map((v, ci) => <motion.i key={ci} title={`${cols[ci]} · ${r} · ${Math.round(v * 100)}% of requests`} className="h-6 rounded-[3px]" style={{ background: fill(v, ri < thr) }}
              initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: ci * 0.03 + ri * 0.02 }} />)}
          </Fragment>
        ))}
        <span />{cols.map((c) => <span key={c} className="pt-1 text-center font-mono text-[10px] text-muted-foreground">{c}</span>)}
        {foot && <><span className="pr-1.5 text-right font-mono text-[10px] text-muted-foreground">{foot[0]}</span>{foot[1].map((c, i) => <span key={i} className="text-center font-mono text-[10px] text-det tabular">{c}</span>)}</>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-2">Share of requests<span className="flex">{[15, 40, 65, 92].map((p) => <i key={p} className="h-2.5 w-5" style={{ background: `color-mix(in srgb, var(--warn) ${p}%, white)` }} />)}</span>under threshold</span>
        <span className="flex items-center gap-2"><span className="flex">{[15, 40, 65, 92].map((p) => <i key={p} className="h-2.5 w-5" style={{ background: `color-mix(in srgb, var(--bad) ${p}%, white)` }} />)}</span>over threshold</span>
      </div>
    </div></div>
  )
}

export function WeekHourHeatmap({ rows, data, ch = 18, gap = 3 }: { rows: string[]; data: number[][]; ch?: number; gap?: number }) {
  const [ref, mw] = useWidth<HTMLDivElement>(580)
  const L = 34, T = 18, cw = Math.max(14, (Math.max(520, mw) - L) / 24 - gap), max = Math.max(...data.flat()), w = L + 24 * (cw + gap), h = T + rows.length * (ch + gap)
  const op = (v: number) => 0.1 + 0.85 * (v / max)
  return (
    <div ref={ref} className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block" role="img" aria-label="Failures by weekday and hour">
        {Array.from({ length: 8 }, (_, i) => i * 3).map((hr) => <text key={hr} x={L + hr * (cw + gap) + cw / 2} y={11} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)" style={{ fontFamily: "var(--font-mono), monospace" }}>{String(hr).padStart(2, "0")}</text>)}
        {rows.map((r, d) => (
          <g key={r}>
            <text x={L - 8} y={T + d * (ch + gap) + ch / 2 + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)">{r}</text>
            {data[d].map((v, hr) => <rect key={hr} x={L + hr * (cw + gap)} y={T + d * (ch + gap)} width={cw} height={ch} rx="3" fill={v ? "var(--bad)" : "rgb(15 37 87 / .05)"} fillOpacity={v ? op(v) : 1}><title>{`${r} ${String(hr).padStart(2, "0")}:00 · ${v} failed runs`}</title></rect>)}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
        <span>0</span>{[0, 0.25, 0.5, 0.75, 1].map((f) => <i key={f} className="h-2.5 w-5 rounded-sm" style={{ background: f ? "var(--bad)" : "rgb(15 37 87 / .05)", opacity: f ? op(f * max) : 1 }} />)}<span>{max} failed runs / hour</span>
      </div>
    </div>
  )
}
