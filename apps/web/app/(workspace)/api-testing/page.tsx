import type { Metadata } from "next"
import { ApiTestingView } from "@/components/quality/quality-views"

export const metadata: Metadata = { title: "API & integration testing" }

export default function ApiTestingPage() {
  return <ApiTestingView />
}
