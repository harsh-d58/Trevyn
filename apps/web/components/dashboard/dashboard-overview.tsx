"use client"

import Link from "next/link"
import { Activity, ArrowRight, ArrowUpRight, ChevronDown, CircleCheck, CirclePause, FolderGit2, Globe, Inbox, Layers, Plus, Radio, ShieldCheck, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { api, apiEnabled, type Items } from "@/lib/api"
import { useLive } from "@/lib/live"
import type { DashboardSummary, RunSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SectionTabs } from "@/components/shell/section-tabs"
import { ActiveRuns } from "./active-runs"
import { CategoryPolar } from "./category-polar"
import { FailingSuites } from "./failing-suites"
import { HeroReadiness } from "./hero-readiness"
import { KpiRow } from "./kpi-row"
import { LoopRings } from "./loop-rings"
import { LoopStrip, PlatformPipeline } from "./platform-live"
import { ReviewQueue } from "./review-queue"
import { RunHealth } from "./run-health"
import { Throughput } from "./throughput"
import { WeekSlots } from "./week-slots"

type Project = { id: string; name: string; environments: { base_url: string }[] }
type Projects = { status: "loading" } | { status: "unavailable" } | { status: "ready"; items: Project[] }
// These optional fields already exist on API run summaries. The shared store contract is unchanged.
type DashboardRun = RunSummary & { uuid?: string; state?: string }

export function runHref(run: DashboardRun) {
  return `/runs/live?run=${encodeURIComponent(run.uuid ?? run.id)}`
}

function useProjects(): Projects {
  const [projects, setProjects] = useState<Projects>({ status: "loading" })
  useEffect(() => {
    if (!apiEnabled) return
    let active = true
    api<Items<Project>>("/api/projects")
      .then(({ items }) => { if (active) setProjects({ status: "ready", items }) })
      .catch(() => { if (active) setProjects({ status: "unavailable" }) })
    return () => { active = false }
  }, [])
  return projects
}

type Focus = { title: string; description: string; label: string; href: string; action: string; tone: string; icon: typeof Activity }

function focusFor(projects: Projects, runs: DashboardRun[], pending: number, inApproval: number, live: boolean): Focus {
  const active = runs.find((run) => run.status === "running")
  const latest = runs[0]
  if (live && projects.status === "ready" && projects.items.length === 0) return {
    title: "Connect an application", description: "Add an application you’re authorised to test.",
    label: "Get started", action: "Connect an application", href: "/runs/new", tone: "brand", icon: Globe,
  }
  if (live && projects.status === "ready" && projects.items.length > 0 && !runs.length) return {
    title: "Start your first test", description: "Your application is connected.",
    label: "Ready to test", action: "Create first test run", href: "/runs/new", tone: "brand", icon: CircleCheck,
  }
  if (active) return {
    title: active.name,
    description: `${active.passed} / ${active.total} tests passed${active.state === "AWAITING_APPROVAL" ? " · Approval required to continue" : ""}`,
    label: active.state === "AWAITING_APPROVAL" ? "Awaiting approval" : "Test in progress", action: "Open live run", href: live ? runHref(active) : "/runs/live", tone: active.state === "AWAITING_APPROVAL" ? "human" : "det", icon: Radio,
  }
  if (pending || inApproval) return {
    title: "Review required", description: `${pending} pending approval${pending === 1 ? "" : "s"} · ${inApproval} finding${inApproval === 1 ? "" : "s"} awaiting review`,
    label: "Needs your review", action: pending ? "Review approvals" : "Review findings", href: pending ? "/approvals" : "/board", tone: "human", icon: Inbox,
  }
  if (latest?.status === "passed") return {
    title: "All tests passed", description: `${latest.name} · ${latest.passed} / ${latest.total} passed`,
    label: "Run passed", action: "View run results", href: live ? runHref(latest) : `/runs?run=${encodeURIComponent(latest.id)}`, tone: "ok", icon: CircleCheck,
  }
  if (latest?.status === "failed") return {
    title: "Test failures found", description: `${latest.name} · Review findings and evidence.`,
    label: "Run completed with failures", action: "Review findings", href: "/findings", tone: "bad", icon: TriangleAlert,
  }
  if (latest) return {
    title: latest.status === "warn" ? "Inconclusive results" : "Run interrupted",
    description: `${latest.name} · ${latest.state ?? (latest.status === "warn" ? "Needs review" : "Stopped")}`,
    label: latest.status === "warn" ? "Inconclusive results" : latest.state === "BLOCKED" ? "Blocked" : latest.state === "FAILED" ? "Execution failed" : "Stopped", action: "Review run", href: live ? runHref(latest) : `/runs?run=${encodeURIComponent(latest.id)}`, tone: "warn", icon: CirclePause,
  }
  return {
    title: "Start testing", description: "Create a run to see results.",
    label: "Workspace overview", action: "New test run", href: "/runs/new", tone: "brand", icon: Layers,
  }
}

function ProjectContext({ projects }: { projects: Projects }) {
  return (
    <div className="overview-projects">
      <span className="overview-project-icon"><FolderGit2 size={17} /></span>
      <div className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold">
          {!apiEnabled ? "Sample workspace" : projects.status === "loading" ? "Loading applications…" : projects.status === "unavailable" ? "Project connection unavailable" : !projects.items.length ? "No application connected" : `${projects.items.length} connected application${projects.items.length === 1 ? "" : "s"}`}
        </span>
        {projects.status === "ready" && projects.items.length > 0 && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{projects.items.map((p) => p.name).join(" · ")}</span>}
      </div>
      <Link href="/runs/new" className="overview-text-link shrink-0">{projects.status === "ready" && !projects.items.length ? "Connect app" : "Test an app"}<ArrowUpRight size={13} /></Link>
    </div>
  )
}

function RunSnapshot({ run, live }: { run?: DashboardRun; live: boolean }) {
  if (!run) return null
  const ratio = run.total ? Math.min(100, Math.max(0, run.passed / run.total * 100)) : 0
  return (
    <div className="overview-run-snapshot">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium tracking-[.12em] text-white/65 uppercase">
        <span>Latest run</span><Activity size={15} />
      </div>
        <div className="mt-6 font-mono text-[11px] text-white/65">{run.id}</div>
        <div className="mt-1 truncate text-[16px] font-semibold">{run.name}</div>
        <div className="mt-5 flex items-end gap-1.5"><span className="text-[34px] leading-none font-medium tabular">{run.passed}</span><span className="pb-0.5 text-[12px] text-white/65">/ {run.total} passed</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#8ddbc9] transition-[width]" style={{ width: `${ratio}%` }} /></div>
        <Link href={live ? runHref(run) : "/runs"} className="mt-5 flex items-center justify-between text-[11px] text-white/80 hover:text-white"><span>{run.status === "running" ? "Watch live" : "View run"}</span><ArrowRight size={14} /></Link>
    </div>
  )
}

export function DashboardOverview({ summary, live }: { summary: DashboardSummary; live: boolean }) {
  const projects = useProjects()
  const runs: DashboardRun[] = useLive((s) => s.runs)
  const pending = useLive((s) => s.approvals.length)
  const findings = useLive((s) => s.findings)
  const scoped: DashboardRun | undefined = useLive((s) => s.runs.find((r) => r.uuid === s.scope)) // the top bar's run picker
  const inApproval = findings.filter((finding) => finding.column === "approval").length
  const running = runs.filter((run) => run.status === "running")
  const focus = focusFor(projects, runs, pending, inApproval, live)
  const Icon = focus.icon
  const executed = summary.kpis.find((k) => k.key === "tests_executed")?.value ?? 0
  const noRuns = live && !runs.length

  return (
    <div className="overview" data-dashboard-source={live ? "live" : "demo"}>
      <div className="mb-5 overflow-x-auto md:hidden"><SectionTabs /></div>
      <header className="overview-heading">
        <div>
          <h1>Overview</h1>
        </div>
        <Link href="/runs/new" className="overview-primary"><Plus size={16} />New test run</Link>
      </header>

      <div className="overview-context-row">
        <ProjectContext projects={projects} />
        <div className={cn("overview-source", !live && "overview-source-demo")}><span className={cn("size-1.5 rounded-full", live ? "bg-det" : "bg-human")} />{live ? "Snapshot" : "Sample data"}<span className="overview-source-divider" />{live ? (scoped ? `${scoped.id} only` : "Last 7 days") : "Demo"}</div>
      </div>
      {!live && apiEnabled && <p className="overview-notice" role="status"><TriangleAlert size={14} />Live data unavailable. Showing sample data.</p>}

      <div className="overview-main-grid">
        <section className={cn("overview-focus", !runs.length && "overview-focus-empty")} aria-labelledby="dashboard-focus-title" data-dashboard-state={focus.label}>
          <div className="overview-focus-copy">
            <span className={cn("overview-state", `overview-state-${focus.tone}`)}><Icon size={13} />{focus.label}</span>
            <h2 id="dashboard-focus-title">{focus.title}</h2>
            <p>{focus.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4"><Link href={focus.href} className="overview-primary">{focus.action}<ArrowRight size={15} /></Link><Link href="/plans" className="overview-text-link">Test plans<ArrowUpRight size={13} /></Link></div>
          </div>
          <RunSnapshot run={scoped ?? running[0] ?? runs[0]} live={live} />
        </section>
        <div className="overview-review"><ReviewQueue /></div>
      </div>

      <div className="overview-section-heading"><h2>Metrics</h2><span>{live ? (scoped ? `${scoped.id} · whole run` : "vs. previous 7 days") : "Sample · vs. previous 30 days"}</span></div>
      <KpiRow kpis={summary.kpis} live={live} />

      <div className="overview-charts-grid">
        <RunHealth data={summary.runHealth} />
        <section className="overview-quality" aria-labelledby="quality-title">
          <div className="flex items-start justify-between gap-3"><h2 id="quality-title" className="text-[17px] font-semibold">Pass rate</h2><span className="overview-quality-icon"><ShieldCheck size={20} /></span></div>
          <div className="mt-6 flex items-baseline gap-2"><span className="text-[46px] leading-none font-medium tracking-[-.04em] tabular">{executed ? summary.gate.passRate.toFixed(1) : "—"}<span className="text-[24px]">{executed ? "%" : ""}</span></span></div>
          <div className="overview-quality-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, summary.gate.passRate))}%` }} /></div>
          <div className="mt-3 flex justify-between text-[11px]"><span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-det" />{summary.gate.passed} passed</span><span className="text-muted-foreground">{summary.gate.failed} {live ? "failed / inconclusive" : "failed"}</span></div>
          <div className="overview-quality-note"><p>{noRuns ? "No test results yet" : `Gate: ${summary.gate.gate}%`}</p></div>
          <Link href="/runs" className="overview-text-link mt-auto pt-5">View runs<ArrowUpRight size={13} /></Link>
        </section>
      </div>

      <div className="overview-bottom-grid"><ActiveRuns live={live} /><CategoryPolar data={summary.categories} live={live} /></div>

      {!live && <details className="overview-demo">
        <summary><span className="overview-state overview-state-human">Demo tools</span><ChevronDown size={16} /></summary>
        <div className="grid gap-4 p-4"><p className="text-[12px] text-muted-foreground">Sample data only.</p><div className="grid gap-4 lg:grid-cols-2"><HeroReadiness gate={summary.gate} /><LoopRings /></div><PlatformPipeline /><LoopStrip /><div className="grid gap-4 lg:grid-cols-3"><FailingSuites data={summary.topSuites} /><Throughput data={summary.throughput} /><WeekSlots data={summary.week} /></div></div>
      </details>}
    </div>
  )
}
