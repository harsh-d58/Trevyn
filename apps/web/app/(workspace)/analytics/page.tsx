import type { Metadata } from "next"
import { AnalyticsView } from "@/components/quality/analytics-view"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return <AnalyticsView />
}
