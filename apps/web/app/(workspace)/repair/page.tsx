import type { Metadata } from "next"
import { RepairView } from "@/components/repair/repair-view"
import { getRepair } from "@/lib/data"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Repair assistant" }

export default async function RepairPage() {
  if (apiEnabled) return <Suspense fallback={<PageLoading title="Repair assistant" />}><LiveRunResult kind="repairs" /></Suspense>
  return <RepairView data={await getRepair()} />
}
