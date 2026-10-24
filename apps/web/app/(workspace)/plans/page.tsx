import type { Metadata } from "next"
import { Suspense } from "react"
import { LivePlansView } from "@/components/plans/live-plans-view"
import { PlanView } from "@/components/plans/plan-view"
import { getPlan } from "@/lib/data"
import { getLivePlans } from "@/lib/live-data"

export const metadata: Metadata = { title: "Test plans" }

export default async function PlansPage() {
  const demo = <PlanView plan={await getPlan()} />
  return <Suspense fallback={demo}><Live demo={demo} /></Suspense>
}

/** real plans stream in after the prerendered demo shell; stays on the demo when the API is off */
async function Live({ demo }: { demo: React.ReactNode }) {
  const plans = await getLivePlans()
  return plans ? <LivePlansView plans={plans.items} /> : demo
}
