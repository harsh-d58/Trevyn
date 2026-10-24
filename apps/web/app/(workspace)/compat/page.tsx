import type { Metadata } from "next"
import { CompatView } from "@/components/quality/quality-views"
import { Suspense } from "react"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { PageLoading } from "@/components/kit/page-loading"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Compatibility" }

export default function CompatPage() {
  return apiEnabled ? <Suspense fallback={<PageLoading title="Compatibility" />}><LiveRunResult kind="environment" /></Suspense> : <CompatView />
}
