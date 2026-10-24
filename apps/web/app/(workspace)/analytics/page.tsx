import type { Metadata } from "next"
import { Suspense } from "react"
import { AnalyticsView } from "@/components/quality/analytics-view"
import { LiveAnalyticsView } from "@/components/quality/live-analytics-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"
import { getLiveAnalytics } from "@/lib/live-data"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  if (!apiEnabled) return <AnalyticsView />
  return <Suspense fallback={<PageLoading title="Analytics" />}><Live /></Suspense>
}

/** with the API on, the page never falls back to demo numbers: unreachable API shows the loading/error state */
async function Live() {
  const data = await getLiveAnalytics()
  return data ? <LiveAnalyticsView data={data} /> : <PageLoading title="Analytics" error="The API did not answer. Check that it is running." />
}
