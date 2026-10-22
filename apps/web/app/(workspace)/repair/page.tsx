import type { Metadata } from "next"
import { RepairView } from "@/components/repair/repair-view"
import { getRepair } from "@/lib/data"

export const metadata: Metadata = { title: "Repair assistant" }

export default async function RepairPage() {
  return <RepairView data={await getRepair()} />
}
