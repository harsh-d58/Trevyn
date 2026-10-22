// Small status primitives ported from trevyn-app/src/components/ui.jsx (Pill, Tag, Sev, Type, Status,
// Avatar, Label) plus the glass-only PriorityTag / ProjectChip / Legend.
import { Flag, Gauge, Globe, Layers, Plug, Shield } from "lucide-react"
import { PEOPLE, PROJECTS } from "@/lib/demo/core"
import type { FindingType, RunStatus, Severity as SeverityLevel } from "@/lib/types"
import { cn } from "@/lib/utils"

export type Tone = "ok" | "bad" | "warn" | "brand" | "ai" | "det" | "human" | "mut"
const TONE: Record<Tone, string> = {
  ok: "bg-ok/12 text-ok", bad: "bg-bad/12 text-bad", warn: "bg-warn/12 text-warn", brand: "bg-brand/10 text-brand",
  ai: "bg-ai/12 text-ai", det: "bg-det/12 text-det", human: "bg-human/12 text-human", mut: "bg-black/5 text-muted-foreground",
}
export const toneText: Record<Tone, string> = {
  ok: "text-ok", bad: "text-bad", warn: "text-warn", brand: "text-brand", ai: "text-ai", det: "text-det", human: "text-human", mut: "text-muted-foreground",
}

export function Pill({ tone = "mut", dot, pulse, children, className }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", TONE[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full bg-current", pulse && "live-dot")} />}{children}
    </span>
  )
}

/* Provenance tag from the deck legend */
const TAGS = { ai: ["AI", "text-ai bg-ai/12"], det: ["DET", "text-det bg-det/12"], human: ["HUMAN", "text-human bg-human/12"], bad: ["FAIL", "text-bad bg-bad/12"], gate: ["GATE", "text-human bg-human/12"] } as const
export const Tag = ({ k }: { k: keyof typeof TAGS }) => (
  <span className={cn("h-fit shrink-0 rounded-md px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide", TAGS[k][1])}>{TAGS[k][0]}</span>
)

export const Severity = ({ s }: { s: SeverityLevel }) => <Pill tone={{ high: "bad", medium: "warn", low: "mut" }[s] as Tone}>{s[0].toUpperCase() + s.slice(1)}</Pill>

const TYPE: Record<FindingType, [typeof Globe, string]> = { ui: [Globe, "UI"], api: [Plug, "API"], perf: [Gauge, "Perf"], security: [Shield, "Security"], compat: [Layers, "Compat"] }
export const FindingTypePill = ({ t }: { t: FindingType }) => { const [I, l] = TYPE[t]; return <Pill tone="brand"><I size={12} />{l}</Pill> }
export const typeLabel = (t: FindingType) => TYPE[t][1]

export const RUN_STATUS: Record<RunStatus, [string, string]> = {
  running: ["bg-det/12 text-det", "Live"], passed: ["bg-ok/12 text-ok", "Passed"], failed: ["bg-bad/12 text-bad", "Failed"],
  warn: ["bg-warn/12 text-warn", "Warnings"], stopped: ["bg-black/5 text-muted-foreground", "Stopped"],
}
export const RunStatusPill = ({ s }: { s: RunStatus }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", RUN_STATUS[s][0])}>
    <i className={cn("size-1.5 rounded-full bg-current", s === "running" && "live-dot")} />{RUN_STATUS[s][1]}
  </span>
)

export const PriorityTag = ({ p }: { p: "urgent" | "high" | "low" }) => (
  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold",
    { urgent: "bg-urgent/12 text-urgent", high: "bg-high/14 text-[#c46a14]", low: "bg-black/5 text-muted-foreground" }[p])}>
    {p === "urgent" && <Flag size={11} strokeWidth={2.5} />}{p[0].toUpperCase() + p.slice(1)}
  </span>
)

export const ProjectChip = ({ name }: { name: string }) => (
  <span className="glass-inset inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[11px] font-medium">
    <i className="size-1.5 rounded-full" style={{ background: PROJECTS[name] ?? "var(--muted-foreground)" }} />{name}
  </span>
)

export const MonoLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("font-mono text-[10.5px] font-medium tracking-[.14em] text-muted-foreground uppercase", className)}>{children}</span>
)

export const hue = (k: string) => ([...k].reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360
export function Avatar({ k, size = 24 }: { k: string; size?: number }) {
  return (
    <span title={PEOPLE[k] ?? k} style={{ width: size, height: size, "--h": hue(k) } as React.CSSProperties}
      className="inline-grid shrink-0 place-items-center rounded-full bg-[hsl(var(--h)_55%_90%)] text-[9.5px] font-semibold text-[hsl(var(--h)_50%_30%)] ring-2 ring-white">{k}</span>
  )
}

/** the deck legend: AI-driven / deterministic / human approval */
export const Legend = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground", className)}>
    {[["bg-ai", "AI-driven"], ["bg-det", "Deterministic"], ["bg-human", "Human approval"]].map(([c, l]) => (
      <span key={l} className="inline-flex items-center gap-1.5"><i className={cn("size-2 rounded-full", c)} />{l}</span>
    ))}
  </span>
)
