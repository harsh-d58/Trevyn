import type { Metadata } from "next"
import { Suspense } from "react"
import { FindingsView, FindingsWithParams } from "@/components/findings/findings-view"

export const metadata: Metadata = { title: "Findings" }

export default function FindingsPage() {
  return <Suspense fallback={<FindingsView />}><FindingsWithParams /></Suspense>
}
