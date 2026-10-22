import type { Metadata } from "next"
import { IntegrationsView } from "@/components/admin/admin-views"

export const metadata: Metadata = { title: "Integrations" }

export default function IntegrationsPage() {
  return <IntegrationsView />
}
