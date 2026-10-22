import type { Metadata } from "next"
import { SecurityView } from "@/components/quality/quality-views"

export const metadata: Metadata = { title: "Security testing" }

export default function SecurityPage() {
  return <SecurityView />
}
