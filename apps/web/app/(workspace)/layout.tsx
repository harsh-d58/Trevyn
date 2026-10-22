import { Shell } from "@/components/shell/shell"
import { getWorkspace } from "@/lib/data"
import { LiveProvider } from "@/lib/live"

export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const workspace = await getWorkspace()
  return (
    <LiveProvider initial={workspace}>
      <Shell>{children}</Shell>
    </LiveProvider>
  )
}
