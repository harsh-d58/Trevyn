"use client"
// Review queue (GLASS_DESIGN_LANGUAGE.md C.10). Checking a row = approving it: the circle fills with a spring,
// the tick draws, a strike sweeps across the title, then the row glides into Done with an Undo toast.
// High-risk items ask for an inline confirmation first: humans decide, nothing high-impact is one tap.
import Link from "next/link"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"
import { api, apiEnabled } from "@/lib/api"
import { useLive, useLiveStore } from "@/lib/live"
import type { Approval } from "@/lib/types"
import { Card, PriorityTag, ProjectChip } from "./bits"
import { cn } from "@/lib/utils"

function CheckCircle({ on, onClick, label }: { on: boolean; onClick?: () => void; label: string }) {
  return (
    <motion.button onClick={onClick} disabled={!onClick} aria-label={label} aria-pressed={on}
      animate={on ? { scale: [0.85, 1.12, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}
      className={cn("pulse mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
        on ? "border-brand bg-brand" : "border-muted-foreground/45 hover:border-brand hover:bg-brand/10")}>
      <svg viewBox="0 0 12 12" className="size-2.5">
        <motion.path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: on ? 1 : 0 }} transition={{ duration: 0.22, delay: on ? 0.1 : 0 }} />
      </svg>
    </motion.button>
  )
}

function Row({ a, done, onApprove }: { a: Approval; done?: boolean; onApprove?: (a: Approval) => void }) {
  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const on = done || checking

  const start = () => {
    setConfirm(false)
    setChecking(true)
    setTimeout(() => onApprove?.(a), 720)
  }

  return (
    <motion.li layout layoutId={a.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: done ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      transition={{ layout: { type: "spring", stiffness: 380, damping: 34 }, duration: 0.25 }}
      className="rounded-2xl px-2 py-2 transition-colors hover:bg-white/60">
      <div className="flex items-start gap-2.5">
        <CheckCircle on={on} label={`Approve ${a.id}`} onClick={done || checking ? undefined : () => (a.risk === "high" ? setConfirm((c) => !c) : start())} />
        <div className="min-w-0 flex-1">
          <div className="relative w-fit max-w-full">
            <Link href="/approvals" className="line-clamp-1 text-[13px] font-medium hover:text-brand">{a.title}</Link>
            <motion.span aria-hidden className="absolute top-1/2 left-0 h-px w-full origin-left bg-foreground/60"
              initial={false} animate={{ scaleX: on ? 1 : 0 }} transition={{ duration: 0.26, delay: on ? 0.18 : 0 }} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <ProjectChip name={a.project} /><span className="font-mono">{a.id}</span><span>·</span><span>{a.when}</span>
          </div>
        </div>
        <PriorityTag p={a.priority} />
      </div>
      <AnimatePresence initial={false}>
        {confirm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 ml-7 rounded-xl border border-human/25 bg-human/8 p-2.5 text-[12px]">
              <p><b className="font-semibold">High-impact.</b> {a.why}.</p>
              <div className="mt-2 flex gap-1.5">
                <button onClick={start} className="press pulse pulse-on-dark rounded-full bg-human px-3 py-1 text-[12px] font-semibold text-white">Approve</button>
                <button onClick={() => setConfirm(false)} className="press rounded-full px-3 py-1 text-[12px] font-medium hover:bg-white/70">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export function ReviewQueue() {
  const store = useLiveStore()
  const pending = useLive((s) => s.approvals)
  const done = useLive((s) => s.approved)

  const approve = (a: Approval) => {
    if (apiEnabled) {
      api(`/api/approvals/${encodeURIComponent(a.id)}/decision`, { json: { approve: true, reason: "" } })
        .then(() => { store.settleApproval(a.id, true); toast(`Approved ${a.id}`, { description: a.title }) })
        .catch((e: Error) => toast.error(e.message))
      return
    }
    const { undoable } = store.approve(a.id)
    toast(`Approved ${a.id}`, { description: a.title, action: undoable ? { label: "Undo", onClick: () => store.undo(a.id) } : undefined })
  }

  return (
    <Card title="Approvals" className="h-full"
      extra={<Link href="/approvals" className="shrink-0 text-[12px] font-medium text-brand hover:underline">All approvals</Link>}>
      <LayoutGroup>
        <ul className="-mx-2 grid content-start">
          <AnimatePresence initial={false}>
            {pending.map((a) => <Row key={a.id} a={a} onApprove={approve} />)}
          </AnimatePresence>
          {pending.length === 0 && <li className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">No pending approvals</li>}
        </ul>
        {done.length > 0 && (
          <>
            <motion.h4 layout className="mt-2 mb-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Done</motion.h4>
            <ul className="-mx-2 grid">
              <AnimatePresence initial={false}>
                {done.slice(0, 3).map((a) => <Row key={a.id} a={a} done />)}
              </AnimatePresence>
            </ul>
          </>
        )}
      </LayoutGroup>
    </Card>
  )
}
