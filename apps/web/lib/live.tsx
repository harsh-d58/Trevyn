"use client"
// Live workspace store: the single source of truth for findings, runs, approvals, the live run and the
// repair loop. The island, Overview, Runs, Live run, Board, Approvals, Repair and Regression all read it.
// In production it is fed by GET /api/runs/{id}/events (SSE). Until then useDemoStream() plays
// LIVE_SCRIPT (the prototype's 17-step run with an approval gate). See PORTING_PLAN.md §3.5–3.6.
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { api, API_URL, type Items } from "./api"
import { RELEASE_APPROVAL, gateApproval } from "./demo/core"
import { LIVE_SCRIPT } from "./demo/runs"
import type { Approval, BoardColumn, Finding, Provenance, RunSummary, ScriptEntry, Workspace } from "./types"

export type FlashKind = "finding" | "approval" | "thinking" | "done" | "info"
export type Flash = { kind: FlashKind; text: string; href?: string; until: number }
export type LiveEvent = { id: number; kind: Provenance | "bad"; text: string }
export type RunState = "running" | "gate" | "done" | "stopped"
export type LogLine = ScriptEntry & { i: number }
export type LiveRun = {
  id: string; name: string; total: number; done: number; failed: number; inconclusive: number
  startedAt: number; state: RunState; log: LogLine[]; cursor: number; gateApproved: boolean
  /** set only for real runs from the API; demo runs come from LIVE_SCRIPT */
  uuid?: string; apiState?: string
}
export type RepairState = "pending" | "running" | "done"
type Pair = [number, number]

export type LiveState = {
  source: "live" | "demo"
  run: LiveRun | null
  flash: Flash | null
  queue: Flash[]
  events: LiveEvent[]
  findings: Finding[]
  runs: RunSummary[]
  approvals: Approval[]
  approved: Approval[]
  repair: RepairState
  releaseRequested: boolean
  loop: { plan: Pair; prove: Pair; decide: Pair }
  runsToday: number
  muted: boolean
}

export const isLive = (r: LiveRun | null): boolean => !!r && (r.state === "running" || r.state === "gate")
const URGENT: FlashKind[] = ["finding", "approval"]
const HOLD: Record<FlashKind, number> = { finding: 5000, approval: 5000, thinking: 3200, done: 6000, info: 2600 }
const VERIFIED_POLICY = "Blocked by policy: a fix reaches Verified only after its regression rerun passes."
const clock = (ms: number) => `${Math.floor(ms / 60000)}m ${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}s`

/** replay the script up to `executed` tests so a run can start mid-way */
function replay(executed: number) {
  let cursor = 0
  while (cursor < LIVE_SCRIPT.length && LIVE_SCRIPT[cursor].at <= executed && LIVE_SCRIPT[cursor].fx !== "complete") cursor++
  const log = LIVE_SCRIPT.slice(0, cursor).map((e, i) => ({ ...e, i }))
  return { cursor, log, failed: log.filter((l) => l.fx === "fail").length, inconclusive: log.filter((l) => l.fx === "inconclusive").length }
}

const TERMINAL_RUN = new Set(["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"])
const sameDay = (iso: string, now = new Date()) => { const d = new Date(iso); return !isNaN(+d) && d.toDateString() === now.toDateString() }

/** The island's run in live mode: the newest unfinished API run, else the newest run (shown as finished). */
function apiRun(runs: RunSummary[], prev: LiveRun | null): LiveRun | null {
  const r = runs.find((x) => x.state ? !TERMINAL_RUN.has(x.state) : x.status === "running") ?? runs[0]
  if (!r) return null
  const active = r.state ? !TERMINAL_RUN.has(r.state) : r.status === "running"
  const kept = prev?.uuid === r.uuid ? prev : null // progress arrives as run_progress events between list refreshes
  return {
    id: r.id, uuid: r.uuid, apiState: r.state, name: r.name, total: Math.max(r.total, kept?.total ?? 0),
    done: active ? kept?.done ?? 0 : r.total, failed: r.total - r.passed, inconclusive: 0,
    startedAt: Date.parse(r.started) || 0, log: [], cursor: 0, gateApproved: r.state !== "AWAITING_APPROVAL",
    state: r.state === "AWAITING_APPROVAL" ? "gate" : active ? "running" : r.status === "stopped" ? "stopped" : "done",
  }
}

function createLiveStore(initial: Workspace) {
  const live = initial.source === "live"
  const seed = initial.runs.find((r) => r.status === "running")
  let state: LiveState = {
    source: live ? "live" : "demo",
    run: live ? apiRun(initial.runs, null)
      : seed ? { id: seed.id, name: seed.name, total: seed.total, done: seed.passed, startedAt: 0, state: "running", gateApproved: true, ...replay(seed.passed) } : null,
    flash: null,
    queue: [],
    events: live ? [] : [
      { id: 1, kind: "ai", text: "Test plan v3 generated · 46 tests" },
      { id: 2, kind: "human", text: "High-impact tests approved by Alex Chen" },
      { id: 3, kind: "bad", text: "CHECKOUT-014 failed · 2 orders for 1 click" },
    ],
    findings: initial.findings,
    runs: initial.runs,
    approvals: initial.approvals,
    approved: [],
    repair: "pending",
    releaseRequested: false,
    loop: initial.summary.loop,
    runsToday: live ? initial.runs.filter((r) => sameDay(r.started)).length : 6,
    muted: false,
  }
  const listeners = new Set<() => void>()
  const set = (fn: (s: LiveState) => Partial<LiveState>) => {
    state = { ...state, ...fn(state) }
    listeners.forEach((l) => l())
  }
  const patchRun = (p: Partial<LiveRun>) => set((s) => ({ run: s.run && { ...s.run, ...p } }))
  const patchSummary = (id: string, p: Partial<RunSummary>) => set((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...p } : r)) }))

  const flash = (kind: FlashKind, text: string, href?: string) =>
    set((s) => {
      if (s.muted && kind !== "approval") return {}
      const f = { kind, text, href, until: 0 }
      return URGENT.includes(kind) ? { queue: [f, ...s.queue] } : { queue: [...s.queue, f] }
    })
  const log = (kind: LiveEvent["kind"], text: string) =>
    set((s) => ({ events: [...s.events, { id: (s.events.at(-1)?.id ?? 0) + 1, kind, text }].slice(-12) }))

  const store = {
    get: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    flash,
    log,
    /** replaces lists with fresh API data after a workspace event; the island's run follows the runs list */
    sync(p: Partial<Pick<LiveState, "findings" | "runs" | "approvals" | "loop">>) {
      set((s) => ({ ...p, ...(p.runs && { run: apiRun(p.runs, s.run), runsToday: p.runs.filter((r) => sameDay(r.started)).length }) }))
    },
    /** UI-lane progress of a real run (workspace event run_progress) */
    progress(uuid: string, done: number, total: number) {
      if (state.run?.uuid === uuid) patchRun({ done, total: Math.max(total, state.run.total) })
    },

    /** clock-dependent fields are seeded after mount so prerendering stays deterministic */
    boot() {
      if (state.run && !state.run.startedAt) patchRun({ startedAt: Date.now() - 252_000 })
    },
    /** advances the visible island flash; called on a short timer */
    pump() {
      const t = Date.now()
      if (state.flash && t < state.flash.until) return
      if (state.queue.length) {
        const [next, ...rest] = state.queue
        set(() => ({ flash: { ...next, until: t + HOLD[next.kind] }, queue: rest }))
      } else if (state.flash) set(() => ({ flash: null }))
    },
    toggleMute() {
      set((s) => ({ muted: !s.muted, queue: s.muted ? s.queue : s.queue.filter((f) => f.kind === "approval") }))
    },

    /* ---------- findings ---------- */
    /** `force` skips the Verified policy; only used to roll back an optimistic move the API rejected */
    moveFinding(id: string, to: BoardColumn, force = false): { ok: boolean; reason?: string } {
      const f = state.findings.find((x) => x.id === id)
      if (!f) return { ok: false, reason: `Unknown finding ${id}` }
      if (f.column === to) return { ok: true }
      if (!force && to === "verified" && f.column !== "regression") return { ok: false, reason: VERIFIED_POLICY }
      set((s) => ({ findings: s.findings.map((x) => (x.id === id ? { ...x, column: to } : x)) }))
      return { ok: true }
    },

    /* ---------- approvals ---------- */
    /** returns whether the decision can be undone (gate and patch approvals start work, so they can't) */
    approve(id: string): { undoable: boolean } {
      const a = state.approvals.find((x) => x.id === id)
      if (!a) return { undoable: false }
      set((s) => ({
        approvals: s.approvals.filter((x) => x.id !== id),
        approved: [a, ...s.approved],
        loop: { ...s.loop, decide: [s.loop.decide[0] + 1, s.loop.decide[1]] },
      }))
      log("human", `${a.id} approved by Alex Chen`)
      if (id.startsWith("GATE-")) { store.resumeGate(); return { undoable: false } }
      if (id === "AP-31") { store.startRepair(); return { undoable: false } }
      return { undoable: true }
    },
    reject(id: string) {
      const a = state.approvals.find((x) => x.id === id)
      if (!a) return
      set((s) => ({ approvals: s.approvals.filter((x) => x.id !== id), loop: { ...s.loop, decide: [s.loop.decide[0] + 1, s.loop.decide[1]] } }))
      log("human", `${a.id} rejected by Alex Chen`)
      if (id.startsWith("GATE-")) store.stopRun("High-impact tests rejected")
    },
    /** live API: the decision was recorded server-side; just drop it from the queue (no demo side effects) */
    settleApproval(id: string, approved: boolean) {
      const a = state.approvals.find((x) => x.id === id)
      if (!a) return
      set((s) => ({
        approvals: s.approvals.filter((x) => x.id !== id),
        approved: approved ? [a, ...s.approved] : s.approved,
        loop: { ...s.loop, decide: [s.loop.decide[0] + 1, s.loop.decide[1]] },
      }))
      log("human", `${a.id} ${approved ? "approved" : "rejected"}`)
    },
    undo(id: string) {
      const a = state.approved.find((x) => x.id === id)
      if (!a) return
      set((s) => ({
        approved: s.approved.filter((x) => x.id !== id),
        approvals: [a, ...s.approvals],
        loop: { ...s.loop, decide: [s.loop.decide[0] - 1, s.loop.decide[1]] },
      }))
    },
    request(a: Approval) {
      if (state.approvals.some((x) => x.id === a.id)) return
      set((s) => ({ approvals: [a, ...s.approvals], loop: { ...s.loop, decide: [s.loop.decide[0], s.loop.decide[1] + 1] } }))
      log("human", `${a.id} · approval requested`)
    },
    requestRelease() {
      if (state.releaseRequested) return
      set(() => ({ releaseRequested: true }))
      store.request(RELEASE_APPROVAL)
      flash("approval", "Release 2.14.0 needs sign-off", "/approvals")
    },

    /* ---------- repair loop (AP-31 ⇄ DEF-142) ---------- */
    approveRepair() {
      if (state.approvals.some((a) => a.id === "AP-31")) store.approve("AP-31")
      else store.startRepair()
    },
    startRepair() {
      if (state.repair !== "pending") return
      set(() => ({ repair: "running" }))
      log("det", "Regression suite started on the patched build")
      setTimeout(() => {
        set(() => ({ repair: "done" }))
        store.moveFinding("DEF-142", "regression")
        log("det", "Regression 46/46 passed · DEF-142 moved to Regression rerun")
        toast("Regression passed 46/46", { description: "DEF-142 moved to Regression rerun." })
      }, 2200)
    },

    /* ---------- live run ---------- */
    launchRun(cfg: { name: string; env: string }): { ok: boolean; reason?: string; id?: string } {
      if (cfg.env === "prod") return { ok: false, reason: "Blocked by policy: production targets are not allowed. Choose staging or QA." }
      const prev = state.run
      if (prev && isLive(prev)) store.settle(prev)
      const n = Math.max(...state.runs.map((r) => Number(r.id.slice(4)))) + 1
      const id = `RUN-${String(n).padStart(4, "0")}`
      const name = `Checkout flow · ${cfg.name}`
      set((s) => ({
        run: { id, name, total: 46, done: 0, failed: 0, inconclusive: 0, startedAt: Date.now(), state: "running", log: [], cursor: 0, gateApproved: false },
        runs: [{ id, name, type: "ui", status: "running", passed: 0, total: 46, duration: "—", trigger: "Manual", started: "Just now", people: ["AC"] }, ...s.runs],
      }))
      log("det", `${id} queued · policy gate passed`)
      return { ok: true, id }
    },
    resumeGate() {
      const r = state.run
      if (!r || r.state !== "gate") return
      patchRun({ state: "running", gateApproved: true })
      log("human", `${r.id} · high-impact tests approved, run continues`)
    },
    approveGate() {
      const r = state.run
      if (!r || r.state !== "gate") return
      const g = gateApproval(r.id).id
      if (state.approvals.some((a) => a.id === g)) store.approve(g)
      else store.resumeGate()
    },
    stopRun(why = "Run stopped") {
      const r = state.run
      if (!r || !isLive(r)) return
      patchRun({ state: "stopped" })
      set((s) => ({ approvals: s.approvals.filter((a) => a.id !== gateApproval(r.id).id) }))
      patchSummary(r.id, { status: "stopped", passed: r.done - r.failed - r.inconclusive, duration: r.startedAt ? clock(Date.now() - r.startedAt) : "—" })
      flash("info", `${r.id} stopped · evidence kept`)
      log("det", `${why}. ${r.id} stopped; evidence collected so far is kept.`)
    },
    /** silently finalise a run that is being replaced */
    settle(r: LiveRun) {
      patchSummary(r.id, { status: "failed", passed: r.total - 2, duration: r.startedAt ? clock(Date.now() - r.startedAt) : "—" })
    },
    finish() {
      const r = state.run
      if (!r) return
      patchRun({ state: "done", done: r.total })
      const passed = r.total - r.failed - r.inconclusive
      patchSummary(r.id, { status: r.failed ? "failed" : r.inconclusive ? "warn" : "passed", passed, duration: r.startedAt ? clock(Date.now() - r.startedAt) : "—" })
      set((s) => ({ runsToday: s.runsToday + 1 }))
      flash("done", `${r.id} finished · ${passed}/${r.total} passed`, "/runs/live")
    },
    /** one tick of the scripted run: emit the next due log line, else execute one more test */
    step() {
      const r = state.run
      if (!r || r.state !== "running") return
      const next = LIVE_SCRIPT[r.cursor]
      if (next && next.at <= r.done) return store.emit(r, next)
      if (r.done < r.total) patchRun({ done: r.done + 1 })
    },
    emit(r: LiveRun, e: ScriptEntry) {
      patchRun({ log: [...r.log, { ...e, i: r.cursor }], cursor: r.cursor + 1 })
      if (e.kind !== "gate") log(e.kind, e.text)
      switch (e.fx) {
        case "gate": {
          patchRun({ state: "gate" })
          store.request(gateApproval(r.id))
          flash("approval", `${r.id} needs approval to continue`, "/runs/live")
          break
        }
        case "fail":
          patchRun({ failed: r.failed + 1 })
          flash("finding", "CHECKOUT-014 failed · duplicate order", "/findings/DEF-142")
          break
        case "repro":
          if (state.loop.prove[0] < state.loop.prove[1]) {
            set((s) => ({ loop: { ...s.loop, prove: [s.loop.prove[1], s.loop.prove[1]] } }))
            toast("Prove ring closed", { description: "Every failure in this run is reproduced with evidence." })
          }
          break
        case "diag":
          flash("thinking", "Diagnosing the duplicate order…")
          break
        case "inconclusive":
          patchRun({ inconclusive: r.inconclusive + 1 })
          break
        case "patch":
          if (state.approvals.some((a) => a.id === "AP-31")) flash("approval", "Patch AP-31 needs review", "/repair")
          break
        case "complete":
          store.finish()
          break
      }
    },
  }
  return store
}

export type LiveStore = ReturnType<typeof createLiveStore>
const LiveContext = createContext<LiveStore | null>(null)

export function LiveProvider({ initial, children }: { initial: Workspace; children: React.ReactNode }) {
  const [store] = useState(() => createLiveStore(initial))
  useDemoStream(store, initial.source !== "live")
  useWorkspaceEvents(store, initial.source === "live") // live API: one workspace feed per tab; each run also has its own SSE
  return <LiveContext.Provider value={store}>{children}</LiveContext.Provider>
}

export function useLiveStore() {
  const s = useContext(LiveContext)
  if (!s) throw new Error("useLive must be used inside <LiveProvider>")
  return s
}

/** select must return a stable reference (a state slice or a primitive), never a fresh object */
export function useLive<T>(select: (s: LiveState) => T): T {
  const store = useLiveStore()
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()))
}

function useDemoStream(store: LiveStore, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    store.boot()
    let ticks = 0
    const id = setInterval(() => {
      if (document.hidden) return
      store.pump()
      if (++ticks % 3 === 0) store.step()
    }, 320)
    return () => clearInterval(id)
  }, [store, enabled])
}

export type WorkspaceEvent = { id: number; type: string; payload: Record<string, string | number | boolean>; ts?: string }
const FLASH: Record<string, (p: WorkspaceEvent["payload"]) => [FlashKind, string, string] | null> = {
  finding_created: (p) => p.status === "confirmed" ? ["finding", `${p.id} confirmed · ${p.severity}`, `/findings/${p.id}`] : null,
  approval_created: (p) => ["approval", `${p.id} needs a decision · ${p.title}`, "/approvals"],
  run_state: (p) => p.state === "COMPLETED" ? ["done", `${p.run} completed`, `/runs/live?run=${p.uuid}`] : null,
}

const LOG_LINE: Record<string, (p: WorkspaceEvent["payload"]) => [LiveEvent["kind"], string]> = {
  run_created: (p) => ["det", `${p.run} queued · policy gate passed`],
  run_state: (p) => [p.state === "FAILED" ? "bad" : "det", `${p.run} → ${String(p.state).toLowerCase().replace(/_/g, " ")}`],
  finding_created: (p) => [p.status === "confirmed" ? "bad" : "det", `${p.id} ${p.status} · ${p.category}`],
  approval_created: (p) => ["human", `${p.id} waiting · ${p.title}`],
  approval_decided: (p) => ["human", `${p.id} ${p.approve ? "approved" : "rejected"}`],
  plan_ready: (p) => ["ai", `Plan ready · ${p.cases} tests (${p.source})`],
}

/** One readable line for a workspace event (island panel, notifications); null for events nobody reads */
export const describeEvent = (e: WorkspaceEvent) => LOG_LINE[e.type]?.(e.payload) ?? null

/** GET /api/events/stream: every change in the workspace rings once; the store refetches the lists and server-rendered
 * pages refresh, debounced so a burst of events (a run finishing) costs one round of requests. */
function useWorkspaceEvents(store: LiveStore, enabled: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    let mounted = true, failures = 0, last = 0
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let debounce: ReturnType<typeof setTimeout> | null = null
    const resync = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(async () => {
        const [findings, runs, approvals, overview] = await Promise.all([
          api<Items<Finding>>("/api/findings"), api<Items<RunSummary>>("/api/runs"), api<Items<Approval>>("/api/approvals?status=pending"),
          api<{ loop: LiveState["loop"] }>("/api/dashboard/overview"),
        ]).catch(() => [null, null, null, null] as const)
        if (!mounted) return
        if (findings && runs && approvals && overview) {
          store.sync({ findings: findings.items, runs: runs.items, approvals: approvals.items, loop: overview.loop })
        }
        router.refresh()
      }, 700)
    }
    const connect = async () => {
      if (!mounted) return
      try {
        const { ticket } = await api<{ ticket: string }>("/api/sse-ticket", { method: "POST" })
        if (!mounted) return
        source = new EventSource(`${API_URL}/api/events/stream?after_id=${last}&ticket=${encodeURIComponent(ticket)}`)
        source.onopen = () => { failures = 0 }
        source.addEventListener("workspace", (m) => {
          try {
            const e = JSON.parse((m as MessageEvent).data) as WorkspaceEvent
            last = Math.max(last, e.id)
            const p = e.payload
            if (e.type === "run_progress") { store.progress(String(p.uuid), Number(p.done), Number(p.total)); return }
            const f = FLASH[e.type]?.(p)
            if (f) store.flash(...f)
            const line = LOG_LINE[e.type]?.(p)
            if (line) store.log(...line)
            resync()
          } catch { /* a malformed event is skipped; the next one resyncs everything */ }
        })
        source.onerror = () => {
          source?.close()
          if (mounted) retry = setTimeout(() => { void connect() }, Math.min(1000 * 2 ** failures++, 15000))
        }
      } catch {
        if (mounted) retry = setTimeout(() => { void connect() }, Math.min(1000 * 2 ** failures++, 15000))
      }
    }
    void connect()
    return () => {
      mounted = false
      source?.close()
      if (retry) clearTimeout(retry)
      if (debounce) clearTimeout(debounce)
    }
  }, [store, enabled, router])
}
