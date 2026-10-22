import { Suspense } from "react"
import { Copilot } from "@/components/shell/copilot"
import { Shell } from "@/components/shell/shell"
import { getWorkspace as getDemoWorkspace } from "@/lib/data"
import { getWorkspace } from "@/lib/live-data"
import { LiveProvider } from "@/lib/live"
import type { Workspace } from "@/lib/types"

function Frame({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  return (
    <LiveProvider initial={workspace}>
      <Shell>{children}</Shell>
      <Copilot source={workspace.source ?? "demo"} />
    </LiveProvider>
  )
}

async function LiveFrame({ children }: { children: React.ReactNode }) {
  return <Frame workspace={await getWorkspace()}>{children}</Frame>
}

// Live API data is short-lived, so it streams in after the prerendered shell (cacheComponents).
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Frame workspace={await getDemoWorkspace()}>{children}</Frame>}>
      <LiveFrame>{children}</LiveFrame>
    </Suspense>
  )
}
