import type { Metadata } from "next"
import { ApiTestingView } from "@/components/quality/quality-views"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "API & integration testing" }

export default function ApiTestingPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="API & integration testing" />}><LiveRunResult kind="api-calls" /></Suspense> : <ApiTestingView />
}
