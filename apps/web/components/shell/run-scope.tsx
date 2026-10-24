"use client"
// Run picker (live mode): every page, chart and diagram follows the chosen run.
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Layers } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useLive, useLiveStore } from "@/lib/live"
import { cn } from "@/lib/utils"

export function RunScope() {
  const store = useLiveStore()
  const router = useRouter()
  const real = useLive((s) => s.source) === "live"
  const scope = useLive((s) => s.scope)
  const project = useLive((s) => s.project)
  const runs = useLive((s) => s.runs)
  if (!real) return null
  const visible = project ? runs.filter((r) => r.project_id === project) : runs
  const current = visible.find((r) => r.uuid === scope)
  const pick = async (uuid: string | null) => {
    await store.setScope(uuid)
    router.refresh() // server-rendered pages (overview, analytics, network) re-read the cookie
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button aria-label="Choose the run every page shows" className={cn("press glass-2 flex h-11 max-w-[240px] items-center gap-2 rounded-full pr-3 pl-1.5 text-[13px] font-medium", scope && "ring-2 ring-brand/40")} />}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Layers size={15} /></span>
        {/* narrow screens: just the run id, so the centred island never covers the picker */}
        <span className="truncate 2xl:hidden">{scope ? current?.id ?? "Run" : "No runs"}</span>
        <span className="hidden truncate 2xl:inline">{scope ? `${current?.id ?? "Run"} · ${current?.name ?? scope.slice(0, 8)}` : "No runs"}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="glass-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl bg-[var(--g2)] p-1.5 ring-0">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show data for</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Recent runs in this project</DropdownMenuLabel>
          {visible.slice(0, 50).map((r) => (
            <DropdownMenuItem key={r.uuid ?? r.id} onClick={() => r.uuid && pick(r.uuid)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate"><span className="font-mono text-[11px] text-muted-foreground">{r.id}</span> · {r.name}</span>
                <span className="block text-[11px] text-muted-foreground">{(r.state ?? r.status).toLowerCase().replace(/_/g, " ")} · {r.passed}/{r.total} passed</span>
              </span>
              {r.uuid === scope && <Check className="text-brand" />}
            </DropdownMenuItem>
          ))}
          {!visible.length && <DropdownMenuItem disabled>No runs yet</DropdownMenuItem>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
