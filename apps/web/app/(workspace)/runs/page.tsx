import type { Metadata } from "next"
import { Suspense } from "react"
import { RunsView, RunsWithParams } from "@/components/runs/runs-view"
import { getRunLedger } from "@/lib/data"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Test runs" }

export default async function RunsPage() {
  const ledger = apiEnabled ? undefined : await getRunLedger()
  // search params stream in after the static shell (cacheComponents)
  return <Suspense fallback={<RunsView ledger={ledger} />}><RunsWithParams ledger={ledger} /></Suspense>
}
