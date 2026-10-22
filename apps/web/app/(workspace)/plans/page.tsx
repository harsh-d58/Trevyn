import type { Metadata } from "next"
import { PlanView } from "@/components/plans/plan-view"
import { getPlan } from "@/lib/data"

export const metadata: Metadata = { title: "Test plans" }

export default async function PlansPage() {
  return <PlanView plan={await getPlan()} />
}
