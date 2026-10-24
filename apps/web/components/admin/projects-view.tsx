"use client"
// Projects (from Overview.jsx Projects): every application Trevyn is authorised to test.
import Link from "next/link"
import { motion } from "motion/react"
import { Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { Sparkline } from "@/components/charts/progress"
import { PageHeader } from "@/components/kit/page-header"
import { hue } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api, apiEnabled } from "@/lib/api"
import { DEMO_PROJECTS } from "@/lib/demo/core"
import { notify } from "@/lib/notify"
import { useLive } from "@/lib/live"

type LiveProject = {
  id: string; name: string
  environments: { base_url: string }[]
  repository: { url: string; ref: string; sha: string; file_map: { file_count: number } } | null
}

export function ProjectsView() {
  const selected = useLive((s) => s.scope)
  const selectedProject = useLive((s) => s.project)
  const runs = useLive((s) => s.runs)
  const projectId = selectedProject ?? runs.find((r) => r.uuid === selected)?.project_id
  const [projects, setProjects] = useState<LiveProject[]>([])
  const [loading, setLoading] = useState(apiEnabled)
  useEffect(() => {
    if (!apiEnabled) return
    let alive = true
    api<{ items: LiveProject[] }>("/api/projects").then((result) => { if (alive) setProjects(result.items) })
      .catch((error: Error) => { if (alive) notify(error.message, "bad") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (apiEnabled) return (
    <div className="grid gap-3.5">
      <PageHeader title="Projects" sub={projectId ? "Project for the selected run." : "Public sites and repositories connected to Trevyn."}>
        <Button variant="brand" size="pill" render={<Link href="/runs/new" />}><Plus />New run</Button>
      </PageHeader>
      {loading && <p className="text-[13px] text-muted-foreground">Loading projects…</p>}
      {!loading && projects.length === 0 && <p className="text-[13px] text-muted-foreground">No projects yet. Create one from a new run.</p>}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {projects.filter((p) => !projectId || p.id === projectId).map((project, i) => <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-1 rounded-[22px] p-4">
          <h3 className="text-[15px] font-semibold">{project.name}</h3>
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{project.environments[0]?.base_url ?? "No site URL"}</p>
          <div className="mt-4 border-t border-border pt-3 text-[12px]">
            <p className="mb-2 text-muted-foreground">{runs.filter((r) => r.project_id === project.id).length} recent runs · {selected ? `selected ${runs.find((r) => r.uuid === selected)?.id ?? selected.slice(0, 8)}` : "no run selected"}</p>
            <div className="grid gap-1" aria-label="Recent pass rates">
              {runs.filter((r) => r.project_id === project.id).slice(0, 5).map((r) => <div key={r.uuid ?? r.id} className="flex justify-between gap-2 font-mono text-[11px]"><span>{r.id}</span><span>{r.total ? `${Math.round(100 * r.passed / r.total)}% passed` : r.state ?? "no results"}</span></div>)}
            </div>
            {project.repository ? <>
              <div className="font-semibold">GitHub connected</div>
              <a href={project.repository.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-brand underline-offset-2 hover:underline">{project.repository.url}</a>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{project.repository.ref} · {project.repository.sha.slice(0, 8)} · {project.repository.file_map.file_count} files indexed</p>
            </> : <p className="text-muted-foreground">No GitHub repository connected</p>}
          </div>
          <Button variant="glass" size="pill-sm" className="mt-4" render={<Link href="/runs/new" />}>New run</Button>
        </motion.div>)}
      </div>
    </div>
  )

  return (
    <div className="grid gap-3.5">
      <PageHeader title="Projects" sub="Every application Trevyn is authorised to test, with its environments and current quality.">
        <Button variant="brand" size="pill" onClick={() => notify("Project created. Add its URL to the allowlist to start testing.")}><Plus />New project</Button>
      </PageHeader>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_PROJECTS.map((p, i) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
            <Link href={i === 0 ? "/" : "/projects"} onClick={() => i && notify(`${p.name} is a sample project in this demo`, "warn")} className="press glass-1 spot block rounded-[22px] p-4 transition-shadow hover:shadow-(--shadow-float)">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span style={{ "--h": hue(p.name) } as React.CSSProperties} className="grid size-9 place-items-center rounded-xl bg-[hsl(var(--h)_55%_90%)] font-semibold text-[hsl(var(--h)_50%_30%)]">{p.name[0]}</span>
                  <div><h3 className="text-[15px] font-semibold">{p.name}</h3><div className="text-[11.5px] text-muted-foreground">{p.desc}</div></div>
                </div>
                <span className="rounded-full bg-human/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wider text-human">{p.env.toUpperCase()}</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-[11.5px] text-muted-foreground">Pass rate</div><div className="text-[24px] font-light tabular">{p.pass}%</div></div>
                <Sparkline v={p.spark} color={p.pass > 90 ? "var(--ok)" : "var(--warn)"} />
              </div>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-[12.5px] text-muted-foreground"><span>{p.open} open findings</span><span className="font-mono">{p.run}</span></div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
