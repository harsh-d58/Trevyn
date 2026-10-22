import type { Metadata } from "next"
import { UiTestingView } from "@/components/quality/quality-views"

export const metadata: Metadata = { title: "Browser & UI testing" }

export default function UiTestingPage() {
  return <UiTestingView />
}
