import type { Metadata } from "next"
import { PlannerView } from "@/components/plans/planner-view"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "AI test planner" }

export default function PlannerPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="AI test planner" />}><LiveRunResult kind="planner" /></Suspense> : <PlannerView />
}
