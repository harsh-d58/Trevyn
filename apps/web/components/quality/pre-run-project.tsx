import Link from "next/link"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { PageLoading } from "@/components/kit/page-loading"
import { type Items } from "@/lib/api"
import { serverApi as api, tryServerApi as tryApi } from "@/lib/api-server"
import { scopedProject } from "@/lib/scope-server"
import { ScrollCard } from "./scroll-card"

export type QualityKind = "ui" | "api-calls" | "perf" | "security" | "environment" | "network"

const LANES: Record<QualityKind, { title: string; result: string }> = {
  ui: { title: "Browser & UI", result: "Browser checks, screenshots, console messages, and accessibility observations appear after a run." },
  "api-calls": { title: "API & integration", result: "Same-site API calls and their response timings appear when browser journeys capture them. Contract tests are not part of this run flow." },
  perf: { title: "Performance", result: "Measured browser vitals and page audits appear after a run. Load tests are not part of this run flow." },
  security: { title: "Security", result: "Passive rule results appear after a run. ZAP and repository scans show results only when those lanes execute." },
  environment: { title: "Compatibility", result: "Browser replay results appear after a run when the configured browsers are available." },
  network: { title: "Network & traces", result: "Captured requests, HAR files, and browser traces appear after a run." },
}

type Project = {
  id: string; name: string; allowed_domains?: string[]
  environments: { name: string; base_url: string }[]
  repository: { url: string; ref: string | null; sha: string | null; file_map?: { file_count?: number } | null } | null
}
type SiteMap = { pages?: { path: string; title?: string }[]; crawled_at?: string; errors?: string[] }
type Plan = { id: string; requirement: string; status: string; version: number; cases: number }
type PlanDetail = { test_cases?: { test_case_id: string; title: string; expected_result?: string }[]; site_map?: SiteMap | null }

const action = "inline-flex items-center rounded-full bg-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90"

/** Real project context for quality lanes before the project's first run. */
export async function PreRunProject({ kind }: { kind: QualityKind }) {
  const lane = LANES[kind]
  const projectId = await scopedProject()
  const projects = await api<Items<Project>>("/api/projects").catch(() => null)
  if (!projects) return <PageLoading title={lane.title} error="Project details could not be loaded. Check the API connection and refresh." />

  const project = projects.items.find((item) => item.id === projectId)
  if (!project) return <div className="grid gap-3.5">
    <PageHeader title={lane.title} />
    <Card title={projectId ? "Project unavailable" : "No project connected"}>
      <p className="text-[13px] text-muted-foreground">{projectId ? "The selected project is no longer available. Choose another project from the top bar." : "Connect a site to see its project details and start a quality run."}</p>
      <Link href={projectId ? "/projects" : "/runs/new"} className={`${action} mt-4`}>{projectId ? "View projects" : "Connect a site"}</Link>
    </Card>
  </div>

  const [savedMap, plans] = await Promise.all([
    tryApi<SiteMap>(`/api/projects/${encodeURIComponent(project.id)}/site-map`),
    tryApi<Items<Plan>>(`/api/plans?project=${encodeURIComponent(project.id)}`),
  ])
  const latestPlan = plans?.items[0]
  const planDetail = latestPlan ? await tryApi<PlanDetail>(`/api/plans/${encodeURIComponent(latestPlan.id)}`) : null
  const siteMap = savedMap ?? planDetail?.site_map
  const cases = planDetail?.test_cases ?? []

  return <div className="grid gap-3.5">
    <PageHeader title={lane.title} sub={project.name} />

    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">No quality run for this project yet</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{lane.result}</p>
      <Link href="/runs/new" className={`${action} mt-4`}>Start a run</Link>
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title="Connected project">
        <p className="text-[16px] font-semibold">{project.name}</p>
        <div className="mt-3 divide-y divide-border text-[12.5px]">
          {project.environments.map((env) => <div key={`${env.name}:${env.base_url}`} className="py-2 first:pt-0"><b>{env.name}</b><p className="mt-1 break-all font-mono text-[11.5px]">{env.base_url}</p></div>)}
          {!project.environments.length && <p className="py-2 text-muted-foreground">No target URL is saved for this project.</p>}
        </div>
        {!!project.allowed_domains?.length && <p className="mt-3 break-words text-[12px] text-muted-foreground">Allowed domains: {project.allowed_domains.join(", ")}</p>}
        <div className="mt-3 border-t border-border pt-3 text-[12px]">
          {project.repository ? <><p className="font-semibold">Public repository connected</p><p className="mt-1 break-all font-mono text-[11.5px]">{project.repository.url}</p><p className="mt-1 text-muted-foreground">{project.repository.ref ? `Ref ${project.repository.ref}` : "Ref not recorded"} · {project.repository.sha ? `commit ${project.repository.sha.slice(0, 12)}` : "commit not recorded"}{project.repository.file_map?.file_count != null ? ` · ${project.repository.file_map.file_count} indexed files` : ""}</p></>
            : <p className="text-muted-foreground">No public repository connected. URL checks can still run.</p>}
        </div>
      </ScrollCard>

      <ScrollCard title="Prepared test plan">
        {latestPlan ? <>
          <p className="text-[15px] font-semibold">{latestPlan.requirement}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Version {latestPlan.version} · {latestPlan.status} · {latestPlan.cases} planned cases</p>
          {cases.length > 0 && <div className="mt-3 divide-y divide-border">{cases.map((testCase) => <div key={testCase.test_case_id} className="py-2 text-[12px]"><b>{testCase.title}</b><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{testCase.test_case_id}</p>{testCase.expected_result && <p className="mt-1 text-muted-foreground">Expected: {testCase.expected_result}</p>}</div>)}</div>}
          {!planDetail && <p className="mt-3 text-[12px] text-muted-foreground">The plan summary loaded, but its cases could not be fetched.</p>}
          <Link href="/plans" className="mt-3 inline-block text-[12px] font-semibold text-brand hover:underline">Open test plans</Link>
        </> : <p className="text-[13px] text-muted-foreground">{plans ? "No plan is saved for this project. Start a run to generate one." : "Test plans could not be loaded. Refresh to try again."}</p>}
      </ScrollCard>

      <ScrollCard title="Saved site discovery">
        {siteMap ? <>
          <p className="text-[15px] font-semibold">{siteMap.pages?.length ?? 0} pages recorded</p>
          {siteMap.crawled_at && <p className="mt-1 text-[12px] text-muted-foreground">Scanned {siteMap.crawled_at}</p>}
          {!!siteMap.pages?.length && <div className="mt-3 divide-y divide-border">{siteMap.pages.map((page) => <div key={page.path} className="py-2 text-[12px]"><b className="break-all font-mono">{page.path}</b>{page.title && <p className="mt-0.5 text-muted-foreground">{page.title}</p>}</div>)}</div>}
          {!!siteMap.errors?.length && <p className="mt-3 text-[12px] text-muted-foreground">Scan notes: {siteMap.errors.join("; ")}</p>}
        </> : <p className="text-[13px] text-muted-foreground">No saved site scan is available. Discovery runs when a URL-based plan is generated.</p>}
      </ScrollCard>

      <ScrollCard title="What is available now">
        <p className="text-[13px] leading-relaxed">Project connection and any saved plan or site scan are shown here from the API. This lane has no measured result until a run records it.</p>
        <p className="mt-3 text-[12px] text-muted-foreground">Choose a different project in the top bar to inspect its own setup and results.</p>
      </ScrollCard>
    </div>
  </div>
}
