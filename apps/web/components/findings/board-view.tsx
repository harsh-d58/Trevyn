"use client"
// Findings board (PORTING_PLAN.md P1.7, from Board.jsx Board). Drag with @dnd-kit (pointer + keyboard:
// Space picks up / drops, arrows move, Enter opens). Drops go through store.moveFinding, which enforces
// "Verified only after a regression rerun"; a refused drop shakes the card and explains why.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { List, Plus } from "lucide-react"
import { useState } from "react"
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { ConfRing } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Avatar, FindingTypePill, Legend, Pill, Severity } from "@/components/kit/pills"
import { Perforation } from "@/components/kit/ticket"
import { Button } from "@/components/ui/button"
import { COLUMNS, columnName } from "@/lib/demo/core"
import { api, apiEnabled } from "@/lib/api"
import { useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"
import type { BoardColumn, Finding } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useFindingFilter } from "./finding-filter"

const DOT: Record<BoardColumn, string> = { triage: "bg-muted-foreground", investigating: "bg-ai", repair: "bg-brand", approval: "bg-human", regression: "bg-det", verified: "bg-ok" }

function Ticket({ f, lifted }: { f: Finding; lifted?: boolean }) {
  return (
    <article className={cn("glass-inset rounded-2xl bg-white/70 transition-shadow", lifted && "shadow-(--shadow-float)")}>
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-2 rotate-45", { high: "bg-bad", medium: "bg-warn", low: "bg-muted-foreground/60" }[f.severity])} />
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{f.id}</span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-snug font-medium">{f.title}</p>
        </div>
        <ConfRing p={f.confidence} />
      </div>
      <div className="flex flex-wrap gap-1 px-3 pt-2 pb-3">
        <FindingTypePill t={f.type} />{f.verdict === "inconclusive" && <Pill tone="warn">Inconclusive</Pill>}{f.severity === "high" && <Severity s="high" />}
      </div>
      <Perforation />
      <div className="flex items-center justify-between px-3 py-2">
        <span className="flex items-center gap-1" title={`${f.evidence} evidence items`}>
          {Array.from({ length: 8 }, (_, i) => <i key={i} className={cn("h-2.5 w-1 rounded-full", i < f.evidence ? "bg-det" : "bg-black/10")} />)}
          <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground">{f.evidence} evidence</span>
        </span>
        <Avatar k={f.owner} size={22} />
      </div>
    </article>
  )
}

function DraggableTicket({ f, shake, onOpen }: { f: Finding; shake: number; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: f.id })
  return (
    <motion.div layout layoutId={f.id} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
      <div ref={setNodeRef} {...listeners} {...attributes} aria-roledescription="Draggable finding" aria-label={`${f.id} ${f.title}. Space to move, Enter to open.`}
        onClick={onOpen} onKeyDown={(e) => { listeners?.onKeyDown?.(e); if (e.key === "Enter") onOpen() }}
        key={shake} className={cn("cursor-grab rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing", isDragging && "opacity-35", shake > 0 && "shake")}>
        <Ticket f={f} />
      </div>
    </motion.div>
  )
}

function Column({ k, label, items, shakes, onOpen }: { k: BoardColumn; label: string; items: Finding[]; shakes: Record<string, number>; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: k })
  return (
    <div ref={setNodeRef} className={cn("glass-1 flex min-h-[460px] flex-col gap-2 rounded-[22px] p-2.5 transition", isOver && "outline-2 outline-offset-2 outline-dashed outline-brand/50")}>
      <div className="flex items-center gap-2 px-1.5 pt-0.5 pb-1.5 text-[12.5px] font-semibold">
        <i className={cn("size-2 rounded-full", DOT[k])} />{label}
        <span className="glass-inset ml-auto rounded-full px-2 text-[11px] text-muted-foreground tabular">{items.length}</span>
      </div>
      {items.map((f) => <DraggableTicket key={f.id} f={f} shake={shakes[f.id] ?? 0} onOpen={() => onOpen(f.id)} />)}
      {isOver && <div className="rounded-2xl border-2 border-dashed border-brand/40 py-6" aria-hidden />}
    </div>
  )
}

export function BoardView() {
  const router = useRouter()
  const store = useLiveStore()
  const [list, bar] = useFindingFilter()
  const [active, setActive] = useState<Finding | null>(null)
  const [shakes, setShakes] = useState<Record<string, number>>({})
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  )

  const start = (e: DragStartEvent) => setActive(list.find((f) => f.id === e.active.id) ?? null)
  const end = (e: DragEndEvent) => {
    setActive(null)
    const to = e.over?.id as BoardColumn | undefined, id = String(e.active.id)
    if (!to) return
    const from = list.find((f) => f.id === id)?.column
    if (from === to) return
    const shake = () => setShakes((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }))
    const res = store.moveFinding(id, to)
    if (!res.ok) { notify(res.reason!, "bad"); shake(); return }
    if (!apiEnabled || !from) { notify(`${id} moved to ${columnName(to)}`); return }
    // optimistic: the card has already moved; roll back if the API refuses (e.g. 409 Verified policy)
    api(`/api/findings/${encodeURIComponent(id)}/board`, { method: "PATCH", json: { column: to } })
      .then(() => notify(`${id} moved to ${columnName(to)}`))
      .catch((err: Error) => { store.moveFinding(id, from, true); shake(); notify(err.message, "bad") })
  }

  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Sprint 14 · Oct 8 – Oct 21" title="Findings board" sub="Drag findings across the workflow. A finding reaches Verified only after its regression rerun passes.">
        <Legend className="mr-2 hidden lg:inline-flex" />
        <Button variant="glass" size="pill" render={<Link href="/findings" />}><List />List view</Button>
        <Button variant="brand" size="pill" render={<Link href="/runs/new" />}><Plus />New test run</Button>
      </PageHeader>
      {bar}
      <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}
        accessibility={{ announcements: {
          onDragStart: ({ active: a }) => `Picked up ${a.id}.`,
          onDragOver: ({ over }) => (over ? `Over ${columnName(over.id as BoardColumn)}.` : "Not over a column."),
          onDragEnd: ({ active: a, over }) => (over ? `Dropped ${a.id} on ${columnName(over.id as BoardColumn)}.` : `${a.id} returned.`),
          onDragCancel: ({ active: a }) => `Moving ${a.id} cancelled.`,
        } }}>
        <div className="grid auto-cols-[minmax(208px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {COLUMNS.map(([k, l]) => <Column key={k} k={k} label={l} items={list.filter((f) => f.column === k)} shakes={shakes} onOpen={(id) => router.push(`/findings/${id}`)} />)}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.22,1,.36,1)" }}>
          {active && <div className="scale-[1.03] rotate-[1.5deg] cursor-grabbing"><Ticket f={active} lifted /></div>}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
