import type { Metadata } from "next"
import { PerfView } from "@/components/quality/quality-views"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Performance testing" }

export default function PerfPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="Performance testing" />}><LiveRunResult kind="perf" /></Suspense> : <PerfView />
}
