import type { Metadata } from "next"
import { PoliciesView } from "@/components/admin/admin-views"
import { LivePolicies } from "@/components/admin/live-admin"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Policies & access" }

export default function PoliciesPage() {
  return apiEnabled ? <LivePolicies /> : <PoliciesView />
}
