"use client"

// One live scope picker: choose a project, then a run within that project.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, FolderKanban, Layers } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useLive, useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"

export type ScopeProject = {
  id: string; name: string; last_run_at?: string | null
  environments: { name: string; base_url: string }[]
}

const host = (url?: string) => { try { return url ? new URL(url).host : "" } catch { return url ?? "" } }
const latestRunTime = (project: ScopeProject) => Date.parse(project.last_run_at ?? "") || 0

export function RunScope({ projects, onOpen }: { projects: ScopeProject[]; onOpen: () => void }) {
  const store = useLiveStore()
  const router = useRouter()
  const real = useLive((state) => state.source) === "live"
  const scope = useLive((state) => state.scope)
  const project = useLive((state) => state.project)
  const runs = useLive((state) => state.runs)
  if (!real) return null

  const visible = project ? runs.filter((run) => run.project_id === project) : runs
  const current = visible.find((run) => run.uuid === scope)
  const projectName = projects.find((item) => item.id === project)?.name ?? (project ? "Project" : "All projects")
  const runLabel = scope ? current?.id ?? scope.slice(0, 8) : "No runs"

  const pickProject = async (id: string) => {
    try { await store.setProject(id); router.refresh() }
    catch (error) { notify((error as Error).message, "bad") }
  }
  const pickRun = async (uuid: string) => {
    try { await store.setScope(uuid); router.refresh() }
    catch (error) { notify((error as Error).message, "bad") }
  }

  return <DropdownMenu onOpenChange={(open) => { if (open) onOpen() }}>
    <DropdownMenuTrigger render={<button aria-label="Choose project and run" title={`${projectName} · ${runLabel}`} className="press glass-2 flex h-11 max-w-[220px] items-center gap-2 rounded-full pr-3 pl-1.5 text-[13px] font-medium ring-2 ring-brand/20 sm:max-w-[320px]" />}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Layers size={15} /></span>
      <span className="hidden min-w-0 truncate sm:inline">{projectName}</span>
      <span className="hidden text-muted-foreground sm:inline">·</span>
      <span className="min-w-0 truncate font-mono text-[11px]">{runLabel}</span>
      <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={10} className="glass-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl bg-[var(--g2)] p-1.5 ring-0">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Projects · most recent run first</DropdownMenuLabel>
        {[...projects].sort((a, b) => latestRunTime(b) - latestRunTime(a)).map((item) => <DropdownMenuItem key={item.id} onClick={() => void pickProject(item.id)}>
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">{item.name[0]?.toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate">{item.name}</span><span className="block truncate text-[11px] text-muted-foreground">{item.environments[0]?.name} · {host(item.environments[0]?.base_url)}</span></span>
          {project === item.id && <Check className="text-brand" />}
        </DropdownMenuItem>)}
        {!projects.length && <DropdownMenuItem render={<Link href="/runs/new" />}>No projects yet · start a run</DropdownMenuItem>}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{project ? `Runs in ${projectName}` : "Recent runs"}</DropdownMenuLabel>
        {visible.slice(0, 50).map((run) => <DropdownMenuItem key={run.uuid ?? run.id} onClick={() => run.uuid && void pickRun(run.uuid)}>
          <span className="min-w-0 flex-1"><span className="block truncate"><span className="font-mono text-[11px] text-muted-foreground">{run.id}</span> · {run.name}</span><span className="block text-[11px] text-muted-foreground">{(run.state ?? run.status).toLowerCase().replace(/_/g, " ")} · {run.passed}/{run.total} passed</span></span>
          {run.uuid === scope && <Check className="text-brand" />}
        </DropdownMenuItem>)}
        {!visible.length && <DropdownMenuItem disabled>No runs yet</DropdownMenuItem>}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/projects" />}><FolderKanban />All projects</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
