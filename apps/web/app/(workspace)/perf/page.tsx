import type { Metadata } from "next"
import { PerfView } from "@/components/quality/quality-views"

export const metadata: Metadata = { title: "Performance testing" }

export default function PerfPage() {
  return <PerfView />
}
