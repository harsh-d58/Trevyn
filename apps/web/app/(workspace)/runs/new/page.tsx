import type { Metadata } from "next"
import { NewRunView } from "@/components/runs/new-run-view"

export const metadata: Metadata = { title: "New test run" }

export default function NewRunPage() {
  return <NewRunView />
}
