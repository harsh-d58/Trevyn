import type { Metadata } from "next"
import { Suspense } from "react"
import { AnalyticsView } from "@/components/quality/analytics-view"
import { LiveAnalyticsView } from "@/components/quality/live-analytics-view"
import { PageLoading } from "@/components/kit/page-loading"
import { Empty } from "@/components/kit/page-loading"
import { PageHeader } from "@/components/kit/page-header"
import { apiEnabled } from "@/lib/api"
import { tryServerApi as tryApi } from "@/lib/api-server"
import { getLiveAnalytics } from "@/lib/live-data"
import { scopedRun } from "@/lib/scope-server"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  if (!apiEnabled) return <AnalyticsView />
  return <Suspense fallback={<PageLoading title="Analytics" />}><Live /></Suspense>
}

/** with the API on, the page never falls back to demo numbers: unreachable API shows the loading/error state */
async function Live() {
  const run = await scopedRun()
  if (!run) return <><PageHeader title="Analytics" /><Empty what="No run in this project" why="Start a run to see its analytics." /></>
  const data = await getLiveAnalytics(run)
  const diagram = run ? await tryApi<{ nodes: { id: string; label: string; sub: string; x: number; y: number; k?: "det" | "bad" | "warn" }[];
    edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }>(`/api/runs/${encodeURIComponent(run)}/diagrams/evidence`) : null
  return data ? <LiveAnalyticsView data={data} diagram={diagram} /> : <PageLoading title="Analytics" error="The API did not answer. Check that it is running." />
}
