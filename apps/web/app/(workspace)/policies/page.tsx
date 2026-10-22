import type { Metadata } from "next"
import { PoliciesView } from "@/components/admin/admin-views"

export const metadata: Metadata = { title: "Policies & access" }

export default function PoliciesPage() {
  return <PoliciesView />
}
