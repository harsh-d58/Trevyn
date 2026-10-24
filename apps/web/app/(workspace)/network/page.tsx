import type { Metadata } from "next"
import { Suspense } from "react"
import { PageLoading } from "@/components/kit/page-loading"
import { LiveNetworkView } from "@/components/quality/live-network-view"
import { NetworkView } from "@/components/quality/network-view"
import { apiEnabled } from "@/lib/api"
import { getLiveNetwork } from "@/lib/live-data"

export const metadata: Metadata = { title: "Network & traces" }

export default function NetworkPage() {
  if (!apiEnabled) return <NetworkView />
  return <Suspense fallback={<PageLoading title="Network & traces" />}><Live /></Suspense>
}

async function Live() {
  const data = await getLiveNetwork()
  return data ? <LiveNetworkView data={data} /> : <PageLoading title="Network & traces" error="The API did not answer. Check that it is running." />
}
