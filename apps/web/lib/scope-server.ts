import { cookies } from "next/headers"
import { PROJECT_COOKIE, SCOPE_COOKIE } from "./scope"
import { type Items, type ApiRun } from "./api"
import { tryServerApi as tryApi } from "./api-server"

/** The run every page is scoped to, or null for all runs. Dynamic: call it only inside a Suspense boundary. */
export async function scopedRun(): Promise<string | null> {
  const selected = (await cookies()).get(SCOPE_COOKIE)?.value
  const project = await scopedProject()
  if (selected) {
    if (!project) return selected
    const selectedRun = await tryApi<ApiRun>(`/api/runs/${encodeURIComponent(selected)}`)
    if (selectedRun?.project_id === project) return selected
  }
  const runs = await tryApi<Items<ApiRun>>(`/api/runs?limit=1${project ? `&project=${encodeURIComponent(project)}` : ""}`)
  return runs?.items[0]?.uuid ?? null
}

export async function scopedProject(): Promise<string | null> {
  const jar = await cookies()
  const selected = jar.get(PROJECT_COOKIE)?.value
  if (selected) return selected
  const run = jar.get(SCOPE_COOKIE)?.value
  if (run) return (await tryApi<ApiRun>(`/api/runs/${encodeURIComponent(run)}`))?.project_id ?? null
  const latest = await tryApi<Items<ApiRun>>("/api/runs?limit=1")
  if (latest?.items[0]?.project_id) return latest.items[0].project_id
  // A connected project can exist before its first run. Keep its quality pages scoped to it.
  const projects = await tryApi<Items<{ id: string }>>("/api/projects")
  return projects?.items.at(-1)?.id ?? null
}
