import type { Metadata } from "next"
import { PlannerView } from "@/components/plans/planner-view"

export const metadata: Metadata = { title: "AI test planner" }

export default function PlannerPage() {
  return <PlannerView />
}
