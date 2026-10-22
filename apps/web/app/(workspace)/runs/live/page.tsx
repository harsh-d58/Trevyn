import type { Metadata } from "next"
import { LiveRunView } from "@/components/runs/live-run-view"

export const metadata: Metadata = { title: "Live run" }

export default function LiveRunPage() {
  return <LiveRunView />
}
