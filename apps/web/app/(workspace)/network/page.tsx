import type { Metadata } from "next"
import { Suspense } from "react"
import { PageLoading } from "@/components/kit/page-loading"
import { LiveNetworkView } from "@/components/quality/live-network-view"
import { PreRunProject } from "@/components/quality/pre-run-project"
import { NetworkView } from "@/components/quality/network-view"
import { apiEnabled } from "@/lib/api"
import { tryServerApi as tryApi } from "@/lib/api-server"
import { getLiveNetwork } from "@/lib/live-data"
import { scopedRun } from "@/lib/scope-server"

export const metadata: Metadata = { title: "Network & traces" }

export default function NetworkPage() {
  if (!apiEnabled) return <NetworkView />
  return <Suspense fallback={<PageLoading title="Network & traces" />}><Live /></Suspense>
}

async function Live() {
  const run = await scopedRun()
  if (!run) return <PreRunProject kind="network" />
  const data = await getLiveNetwork(run)
  const graphs = run ? await Promise.all(["service", "api"].map((name) => tryApi<{ nodes: { id: string; label: string; sub: string; x: number; y: number; k?: "det" | "acc" | "mut" }[];
    edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }>(`/api/runs/${encodeURIComponent(run)}/diagrams/${name}`))) : []
  return data ? <LiveNetworkView data={data} graphs={graphs} /> : <PageLoading title="Network & traces" error="The API did not answer. Check that it is running." />
}
