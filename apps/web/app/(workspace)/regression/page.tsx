import type { Metadata } from "next"
import { RegressionView } from "@/components/plans/regression-view"
import { getRegression } from "@/lib/data"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Regression suite" }

export default async function RegressionPage() {
  if (apiEnabled) return <Suspense fallback={<PageLoading title="Regression suite" />}><LiveRunResult kind="regression" /></Suspense>
  return <RegressionView data={await getRegression()} />
}
