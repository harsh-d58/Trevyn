import type { Metadata } from "next"
import { RegressionView } from "@/components/plans/regression-view"
import { getRegression } from "@/lib/data"

export const metadata: Metadata = { title: "Regression suite" }

export default async function RegressionPage() {
  return <RegressionView data={await getRegression()} />
}
