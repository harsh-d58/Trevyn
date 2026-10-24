import type { Metadata } from "next"
import { IntegrationsView } from "@/components/admin/admin-views"
import { LiveIntegrations } from "@/components/admin/live-admin"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Integrations" }

export default function IntegrationsPage() {
  return apiEnabled ? <LiveIntegrations /> : <IntegrationsView />
}
