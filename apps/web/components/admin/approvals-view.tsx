"use client"
// Approvals (PORTING_PLAN.md P1.10, from Admin.jsx Approvals). Same store as the Overview review queue,
// so decisions here move the Decide ring, resume a gated live run, or start the DEF-142 repair.
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { CircleCheck } from "lucide-react"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Avatar, Pill, Severity, Tag } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { useLive, useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"
import type { Approval } from "@/lib/types"

const CATS: Approval["category"][] = ["High-impact tests", "Uncertain diagnoses", "Accepting patches", "Release and risk calls"]

export function ApprovalsView() {
  const store = useLiveStore()
  const approvals = useLive((s) => s.approvals)
  const decide = (a: Approval, ok: boolean) => {
    if (ok) {
      const { undoable } = store.approve(a.id)
      notify(`Approved: ${a.title}`, "ok", undoable ? { action: { label: "Undo", onClick: () => store.undo(a.id) } } : undefined)
    } else {
      store.reject(a.id)
      notify(`Rejected: ${a.title}`, "warn")
    }
  }
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Approvals" sub="Humans still decide. These items are waiting for a person."><Pill tone="human">{approvals.length} waiting</Pill></PageHeader>
      <Card flush>
        <AnimatePresence initial={false}>
          {approvals.map((a) => (
            <motion.div key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, x: 24 }}
              className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3.5 last:border-0">
              <span className="mt-0.5"><Tag k="human" /></span>
              <div className="min-w-56 flex-1">
                <div className="text-[11.5px] text-muted-foreground">{a.category} · <span className="font-mono">{a.id}</span></div>
                <div className="my-0.5 font-medium">{a.href ? <Link href={a.href} className="text-brand hover:underline">{a.title}</Link> : a.title}</div>
                <div className="text-[13px] text-muted-foreground">{a.why}</div>
              </div>
              <Severity s={a.risk} /><Avatar k={a.who} />
              <div className="flex gap-2">
                <Button variant="glass" size="pill-sm" onClick={() => decide(a, false)}>Reject</Button>
                <Button variant={a.risk === "high" ? "human" : "brand"} size="pill-sm" onClick={() => decide(a, true)}>Approve</Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {approvals.length === 0 && (
          <div className="p-10 text-center">
            <CircleCheck size={28} className="mx-auto text-ok" />
            <h3 className="mt-2 font-semibold">Nothing waiting</h3>
            <p className="text-[13px] text-muted-foreground">New patches, risky tests and release calls will appear here.</p>
          </div>
        )}
      </Card>
      <div className="glass-1 grid gap-px overflow-hidden rounded-[22px] sm:grid-cols-2 xl:grid-cols-4">
        {CATS.map((c) => (
          <div key={c} className="bg-white/30 p-4">
            <div className="text-[12.5px] text-muted-foreground">{c}</div>
            <div className="text-[24px] font-light tabular">{approvals.filter((a) => a.category === c).length}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
