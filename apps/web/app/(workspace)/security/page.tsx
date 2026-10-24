import type { Metadata } from "next"
import { SecurityView } from "@/components/quality/quality-views"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Security testing" }

export default function SecurityPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="Security testing" />}><LiveRunResult kind="security" /></Suspense> : <SecurityView />
}
