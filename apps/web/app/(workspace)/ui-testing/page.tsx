import type { Metadata } from "next"
import { UiTestingView } from "@/components/quality/quality-views"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Browser & UI testing" }

export default function UiTestingPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="Browser & UI testing" />}><LiveRunResult kind="ui" /></Suspense> : <UiTestingView />
}
