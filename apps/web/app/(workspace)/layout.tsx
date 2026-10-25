import { Suspense } from "react"
import { Shell } from "@/components/shell/shell"
import { getWorkspace as getDemoWorkspace } from "@/lib/data"
import { apiEnabled } from "@/lib/api"
import { emptyLiveWorkspace, getWorkspace } from "@/lib/live-data"
import { scopedProject, scopedRun } from "@/lib/scope-server"
import { LiveProvider } from "@/lib/live"
import type { Workspace } from "@/lib/types"

function Frame({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  return (
    <LiveProvider initial={workspace}>
      <Shell>{children}</Shell>
    </LiveProvider>
  )
}

async function LiveFrame({ children }: { children: React.ReactNode }) {
  return <Frame workspace={await getWorkspace(apiEnabled ? await scopedRun() : null, apiEnabled ? await scopedProject() : null)}>{children}</Frame>
}

// Live API data is short-lived, so it streams in after the prerendered shell (cacheComponents).
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Frame workspace={await (apiEnabled ? emptyLiveWorkspace() : getDemoWorkspace())}>{children}</Frame>}>
      <LiveFrame>{children}</LiveFrame>
    </Suspense>
  )
}
