"use client"
// Greeting header + live status sentence + stat pills (GLASS_DESIGN_LANGUAGE.md C.6, C.7)
import Link from "next/link"
import { Play, Plus } from "lucide-react"
import { useSyncExternalStore } from "react"
import { RollingNumber } from "@/components/fx/numbers"
import { isLive, useLive } from "@/lib/live"

// client-only clock read: the server snapshot is null so the prerendered shell stays deterministic
const noop = () => () => {}
function daypart() {
  const now = new Date(), h = now.getHours()
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  return `${hello}|${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
}
function useDaypart() {
  const v = useSyncExternalStore(noop, daypart, () => null)
  if (!v) return null
  const [hello, date] = v.split("|")
  return { hello, date }
}

export function Greeting() {
  const d = useDaypart()
  const live = useLive((s) => (isLive(s.run) ? 1 : 0))
  const pending = useLive((s) => s.approvals.length)
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-.02em] text-navy sm:text-[32px]">{d?.hello ?? "Welcome back"}, Alex</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {d?.date ?? "Today"} ·{" "}
          <Link href="/runs/live" className="font-medium text-foreground underline-offset-2 hover:underline">{live} run{live === 1 ? "" : "s"} live</Link> ·{" "}
          <Link href="/approvals" className="font-medium text-foreground underline-offset-2 hover:underline">{pending} approval{pending === 1 ? "" : "s"} waiting for you</Link>
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/runs/new" className="press pulse glass-2 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium"><Plus size={15} />New run</Link>
        <Link href="/runs/live" className="press pulse pulse-on-dark glow-brand inline-flex h-10 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] px-4 text-[13px] font-semibold text-white transition-shadow hover:shadow-[0_10px_30px_-6px_color-mix(in_oklab,var(--brand)_70%,transparent)]">
          <Play size={14} fill="currentColor" />Watch live
        </Link>
      </div>
    </div>
  )
}

export function StatPills() {
  const runsToday = useLive((s) => s.runsToday)
  const live = useLive((s) => (isLive(s.run) ? 1 : 0))
  const pending = useLive((s) => s.approvals.length)
  const pills: [string, number, string, React.ReactNode?][] = [
    ["Runs today", runsToday, "/runs"],
    ["Live", live, "/runs", live ? <span className="live-dot size-2 rounded-full bg-det" /> : null],
    ["Awaiting you", pending, "/approvals"],
  ]
  return (
    <div className="flex gap-2">
      {pills.map(([label, v, href, dot]) => (
        <Link key={label} href={href} className="press pulse glass-1 spot flex min-w-[104px] flex-col rounded-2xl px-3.5 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{dot}{label}</span>
          <RollingNumber value={v} className="text-[22px] leading-tight font-light tabular" />
        </Link>
      ))}
    </div>
  )
}
