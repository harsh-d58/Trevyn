import type { Metadata } from "next"
import { Suspense } from "react"
import { PlanView } from "@/components/plans/plan-view"
import { getPlan } from "@/lib/data"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Test plans" }

export default async function PlansPage() {
  if (apiEnabled) return <Suspense fallback={<PageLoading title="Test plan" />}><LiveRunResult kind="plan" /></Suspense>
  return <PlanView plan={await getPlan()} />
}
