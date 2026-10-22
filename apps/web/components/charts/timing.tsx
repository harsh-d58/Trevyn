// Timing charts ported from net.jsx / rcharts.jsx: HAR waterfall, run Gantt, ledger bars.
// Every chart uses one shared linear time scale with labelled ticks.
import type { HarRow } from "@/lib/demo/findings"
import type { RunStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MonoLabel } from "@/components/kit/pills"

const PH: [keyof HarRow["ph"], string, string][] = [
  ["dns", "DNS", "bg-det/50"], ["conn", "Connect", "bg-human/55"], ["tls", "TLS", "bg-ai/50"], ["wait", "Waiting (TTFB)", "bg-brand"], ["recv", "Download", "bg-ok"],
]
const pct = (v: number, of: number) => `${(v / of) * 100}%`

function Ticks({ ticks, total, fmt }: { ticks: number[]; total: number; fmt: (t: number) => string }) {
  return (
    <div className="relative h-4">
      {ticks.map((t) => (
        <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground tabular first:translate-x-0 last:-translate-x-full" style={{ left: pct(t, total) }}>{fmt(t)}</span>
      ))}
    </div>
  )
}

/** HAR-style request waterfall: each row is one request split into its timing phases */
export function Waterfall({ rows, total }: { rows: HarRow[]; total: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * total))
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[230px_1fr] items-end gap-3 border-b border-border pb-1.5"><MonoLabel>Request</MonoLabel><Ticks ticks={ticks} total={total} fmt={(t) => `${t} ms`} /></div>
        {rows.map((r, i) => {
          const dur = Object.values(r.ph).reduce((a, b) => a + (b ?? 0), 0)
          let acc = r.start
          return (
            <div key={i} className={cn("grid grid-cols-[230px_1fr] items-center gap-3 border-b border-border/60 py-1.5", r.flag && "bg-bad/6")}>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[11.5px]">
                <span className={cn("w-9 shrink-0 font-semibold", r.m === "GET" ? "text-det" : "text-brand")}>{r.m}</span>
                <span className="truncate" title={r.u}>{r.u}</span>
                <span className={cn("ml-auto shrink-0", r.st >= 400 ? "text-bad" : "text-muted-foreground")}>{r.st}</span>
              </div>
              <div className="relative h-5">
                {ticks.slice(1, -1).map((t) => <i key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: pct(t, total) }} />)}
                {PH.map(([k, , c]) => {
                  const v = r.ph[k] ?? 0, left = acc
                  acc += v
                  return v ? <i key={k} title={`${k} ${v} ms`} className={cn("absolute top-1 h-3 first:rounded-l last:rounded-r", c)} style={{ left: pct(left, total), width: `${Math.max(0.4, (v / total) * 100)}%` }} /> : null
                })}
                <span className={cn("absolute top-0.5 pl-1.5 font-mono text-[10px] whitespace-nowrap", r.flag ? "font-semibold text-bad" : "text-muted-foreground")} style={{ left: pct(r.start + dur, total) }}>
                  {dur} ms{r.flag ? ` · ${r.flag}` : ""}
                </span>
              </div>
            </div>
          )
        })}
        <div className="mt-2.5 flex flex-wrap gap-3">{PH.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><i className={cn("h-2.5 w-4 rounded-sm", c)} />{l}</span>)}</div>
      </div>
    </div>
  )
}

/** Gantt-like run timeline: each run split into its phases on one shared time axis (seconds) */
export function Gantt({ rows, phases, max, ticks }: {
  rows: { id: string; name: string; status: "passed" | "failed" | "warn"; duration: string; seg: [string, number][] }[]
  phases: [string, string, string][]; max: number; ticks: number[]
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[210px_1fr] items-end gap-3 border-b border-border pb-1.5"><MonoLabel>Run</MonoLabel><Ticks ticks={ticks} total={max} fmt={(t) => `${Math.round(t / 60)}m`} /></div>
        {rows.map((r) => {
          let acc = 0
          const tot = r.seg.reduce((a, [, v]) => a + v, 0)
          return (
            <div key={r.id} className="grid grid-cols-[210px_1fr] items-center gap-3 border-b border-border/60 py-2 last:border-0">
              <div className="flex min-w-0 items-center gap-2">
                <i className={cn("size-2 shrink-0 rotate-45", { passed: "bg-ok", failed: "bg-bad", warn: "bg-warn" }[r.status])} />
                <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span><span className="truncate text-[12.5px]" title={r.name}>{r.name}</span>
              </div>
              <div className="relative h-6">
                {ticks.slice(1).map((t) => <i key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: pct(t, max) }} />)}
                {r.seg.map(([k, v]) => {
                  const left = acc, ph = phases.find((p) => p[0] === k)!
                  acc += v
                  return v ? <i key={k} title={`${ph[1]} · ${v}s`} className={cn("absolute top-1.5 h-3 first:rounded-l-[3px] last:rounded-r-[3px]", ph[2])} style={{ left: pct(left, max), width: pct(v, max) }} /> : null
                })}
                <span className="absolute top-1 pl-2 font-mono text-[10.5px] text-muted-foreground tabular" style={{ left: pct(tot, max) }}>{r.duration}</span>
              </div>
            </div>
          )
        })}
        <div className="mt-3 flex flex-wrap gap-3">{phases.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><i className={cn("h-2.5 w-4 rounded-sm", c)} />{l}</span>)}</div>
      </div>
    </div>
  )
}

/** Per-run pass / fail mini stacked bar */
export function ResultBar({ p, t, st }: { p: number; t: number; st: RunStatus }) {
  const rest = t - p, rc = st === "warn" ? "bg-warn" : st === "stopped" ? "bg-muted-foreground/40" : "bg-bad"
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-2.5 w-28 shrink-0 gap-[2px] overflow-hidden rounded-sm bg-black/5">
        {st === "running" ? <i className="block h-full rounded-sm bg-det transition-all duration-500" style={{ width: pct(p, t) }} />
          : <><i className="block h-full bg-ok" style={{ width: pct(p, t) }} />{rest > 0 && <i className={cn("block h-full", rc)} style={{ width: pct(rest, t) }} />}</>}
      </div>
      <span className="font-mono text-[11.5px] whitespace-nowrap tabular">{p}<span className="text-muted-foreground"> / {t}</span></span>
      {rest > 0 && st !== "running" && <span className={cn("font-mono text-[10.5px] tabular", st === "warn" ? "text-warn" : st === "stopped" ? "text-muted-foreground" : "text-bad")}>−{rest}</span>}
    </div>
  )
}

export const secs = (d: string) => { const m = /(\d+)m\s*(\d+)s/.exec(d || ""); return m ? +m[1] * 60 + +m[2] : 0 }
/** Duration bar on a shared scale (max seconds) */
export function DurBar({ d, max }: { d: string; max: number }) {
  const s = secs(d)
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-black/5"><i className={cn("block h-full rounded-full", s > 600 ? "bg-warn" : "bg-det")} style={{ width: pct(s, max) }} /></div>
      <span className="font-mono text-[11.5px] whitespace-nowrap text-muted-foreground tabular">{d}</span>
    </div>
  )
}
