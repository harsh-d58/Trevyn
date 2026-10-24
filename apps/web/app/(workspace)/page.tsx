import type { Metadata } from "next"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { Suspense } from "react"
import { getDashboardSummary } from "@/lib/data"
import { getLiveOverview } from "@/lib/live-data"
import { emptyLiveWorkspace } from "@/lib/live-data"
import { apiEnabled } from "@/lib/api"
import { scopedRun } from "@/lib/scope-server"
import type { DashboardSummary } from "@/lib/types"

export const metadata: Metadata = { title: "Overview" }

export default async function Overview() {
  if (!apiEnabled) return <Body s={await getDashboardSummary()} live={false} />
  const empty = (await emptyLiveWorkspace()).summary
  return <Suspense fallback={<Body s={empty} live />}><Live empty={empty} /></Suspense>
}

/** Live API numbers stream in after the prerendered shell; cards with no backend source yet are hidden in live mode */
async function Live({ empty }: { empty: DashboardSummary }) {
  const run = await scopedRun()
  const live = run ? await getLiveOverview(run) : null
  return <Body s={live ? { ...empty, ...live } : empty} live />
}

function Body({ s, live }: { s: DashboardSummary; live: boolean }) {
  return <DashboardOverview summary={s} live={live} />
}
