import type { Metadata } from "next"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { Suspense } from "react"
import { getDashboardSummary } from "@/lib/data"
import { getLiveOverview } from "@/lib/live-data"
import type { DashboardSummary } from "@/lib/types"

export const metadata: Metadata = { title: "Overview" }

export default async function Overview() {
  const demo = await getDashboardSummary()
  return <Suspense fallback={<Body s={demo} live={false} />}><Live demo={demo} /></Suspense>
}

/** Live API numbers stream in after the prerendered shell; cards with no backend source yet are hidden in live mode */
async function Live({ demo }: { demo: DashboardSummary }) {
  const live = await getLiveOverview()
  return live ? <Body s={{ ...demo, ...live }} live /> : <Body s={demo} live={false} />
}

function Body({ s, live }: { s: DashboardSummary; live: boolean }) {
  return <DashboardOverview summary={s} live={live} />
}
