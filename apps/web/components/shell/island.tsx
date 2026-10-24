"use client"
// Dynamic island (GLASS_DESIGN_LANGUAGE.md C.4): the one dark object in the light UI. It morphs width,
// height and radius with a spring as live state changes, and expands into a panel on click.
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { BellOff, Check, CircleCheck, Moon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { isLive, useLive, useLiveStore, type Flash, type LiveState } from "@/lib/live"
import { cn } from "@/lib/utils"

type View = { key: string; width: number }
const TAG = { ai: "text-[#b9a8ff]", det: "text-[#5fe0cc]", human: "text-[#ffbe6b]", bad: "text-[#ff8b8b]" } as const

// one-second clock; null during prerender
const tick = (cb: () => void) => { const id = setInterval(cb, 1000); return () => clearInterval(id) }
const useNow = () => useSyncExternalStore(tick, () => Math.floor(Date.now() / 1000) * 1000, () => null)
const Demo = () => <span className="rounded bg-white/12 px-1 font-mono text-[9px] font-semibold tracking-wider text-white/70" title="Scripted demo run, not a real execution">DEMO</span>
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`

function Ring({ p }: { p: number }) {
  const C = 2 * Math.PI * 6
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
      <circle cx="8" cy="8" r="6" fill="none" stroke="rgb(255 255 255 / .15)" strokeWidth="2.5" />
      <motion.circle cx="8" cy="8" r="6" fill="none" stroke="#45dcc6" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={C} animate={{ strokeDashoffset: C * (1 - p) }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
    </svg>
  )
}

function Compact({ flash, run, muted, now, activity }: { flash: Flash | null; run: LiveState["run"]; muted: boolean; now: number | null; activity: LiveState["activity"] }) {
  if (flash) {
    const dot = { finding: "bg-[#ff6b6b]", approval: "bg-[#ffb547]", thinking: "bg-[#b9a8ff]", done: "", info: "bg-[#45dcc6]" }[flash.kind]
    return (
      <>
        {flash.kind === "done" ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><CircleCheck size={16} className="text-[#45dcc6]" /></motion.span>
          : <span className={cn("live-dot size-2 shrink-0 rounded-full", dot)} />}
        <span className={cn("truncate font-medium", flash.kind === "thinking" && "shimmer-text")}>{flash.text}</span>
      </>
    )
  }
  if (run && isLive(run) && run.state === "gate") {
    return (
      <>
        <span className="live-dot size-2 shrink-0 rounded-full bg-[#ffb547]" />
        <span className="truncate font-medium">{run.id} waiting for approval</span>
        {!run.uuid && <span className="ml-auto"><Demo /></span>}
      </>
    )
  }
  if (run && isLive(run)) {
    return (
      <>
        <Ring p={run.total ? run.done / run.total : 0} />
        <span className="font-mono text-[11.5px] text-white/70">{run.id}</span>
        <span className="font-semibold tabular">{run.done}/{run.total}</span>
        {activity && <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/75" title={activity.text}>{activity.text}</span>}
        <span className="ml-auto font-mono text-[11.5px] text-white/60 tabular">{now && run.startedAt ? clock(now - run.startedAt) : "–:––"}</span>
        {!run.uuid && <Demo />}
        {muted && <Moon size={13} className="text-white/60" />}
      </>
    )
  }
  return (
    <>
      <span className="size-2 shrink-0 rounded-full bg-[#45dcc6]" />
      <span className="text-white/85">All quiet</span>
      <span className="ml-auto truncate text-[11.5px] text-white/55">{muted ? <Moon size={13} /> : run ? `${run.id} ${run.uuid ? (run.apiState ?? run.state).toLowerCase() : run.state}` : "no live runs"}</span>
    </>
  )
}

export function Island() {
  const store = useLiveStore()
  const flash = useLive((s) => s.flash)
  const run = useLive((s) => s.run)
  const activity = useLive((s) => (s.activity && s.activity.uuid === s.run?.uuid ? s.activity : null))
  const muted = useLive((s) => s.muted)
  const events = useLive((s) => s.events)
  const [open, setOpen] = useState(false)
  const now = useNow()
  const live = isLive(run)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc) }
  }, [open])

  const view: View = open ? { key: "panel", width: 420 }
    : flash ? { key: `flash-${flash.kind}-${flash.text}`, width: flash.kind === "finding" ? 320 : flash.kind === "done" ? 300 : 320 }
    // a live run with an activity line needs room to read it
    : live && run ? { key: `run-${run.state}`, width: run.state === "gate" ? 300 : activity ? 460 : 300 } : { key: "idle", width: 240 }

  return (
    <div ref={ref} className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 md:top-3 md:bottom-auto">
      <motion.div layout role="status" aria-live="polite"
        className="island max-w-[calc(100vw-24px)] overflow-hidden"
        initial={false}
        animate={{ width: view.width, height: open ? 228 : 38, borderRadius: open ? 26 : 19 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={view.key}
            initial={{ opacity: 0, filter: "blur(4px)", scale: 0.96 }} animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }} exit={{ opacity: 0, filter: "blur(4px)", scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="h-full">
            {open ? (
              <div className="flex h-full flex-col p-4 text-[12.5px]">
                <div className="flex items-center gap-2">
                  {run ? <Ring p={run.total ? run.done / run.total : 0} /> : <span className="size-2 rounded-full bg-[#45dcc6]" />}
                  <span className="truncate font-semibold">{run ? `${run.id} · ${run.name}` : "No live runs"}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {live && run && <span className="font-mono text-white/60 tabular">{now && run.startedAt ? clock(now - run.startedAt) : ""}</span>}
                    {run && !live && <span className="text-[11px] text-white/60 capitalize">{run.state}</span>}
                    {run && !run.uuid && <Demo />}
                  </span>
                </div>
                {run && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full bg-[#45dcc6]" animate={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
                  </div>
                )}
                <ul className="mt-3 grid gap-1.5 overflow-hidden">
                  {events.slice(-4).reverse().map((e) => (
                    <motion.li key={e.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                      <span className={cn("w-11 shrink-0 font-mono text-[10px] font-semibold uppercase", TAG[e.kind])}>{e.kind === "bad" ? "fail" : e.kind}</span>
                      <span className="truncate text-white/85">{e.text}</span>
                    </motion.li>
                  ))}
                </ul>
                <div className="mt-auto flex gap-2 pt-3">
                  <Link href={run?.uuid ? `/runs/live?run=${run.uuid}` : "/runs/live"} onClick={() => setOpen(false)} className="press pulse pulse-on-dark rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-ink">Open run</Link>
                  {run?.state === "gate" && (
                    <button onClick={() => store.approveGate()} className="press pulse pulse-on-dark rounded-full bg-[#f7ae47] px-3 py-1.5 text-[12px] font-semibold text-ink">Approve tests</button>
                  )}
                  <button onClick={() => store.toggleMute()} className="press pulse pulse-on-dark inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium hover:bg-white/15">
                    {muted ? <><Check size={13} />Unmute</> : <><BellOff size={13} />Hold alerts</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-9.5 items-center pr-1.5">
                <button onClick={() => setOpen(true)} aria-expanded={open} aria-label="Live activity"
                  className="pulse pulse-on-dark flex h-full min-w-0 flex-1 items-center gap-2 pl-3.5 pr-2 text-left text-[12.5px]">
                  <Compact flash={flash} run={run} muted={muted} now={now} activity={activity} />
                </button>
                {flash?.href && (
                  <Link href={flash.href} className="press pulse pulse-on-dark shrink-0 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20">
                    {flash.kind === "approval" ? "Review" : "View"}
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
