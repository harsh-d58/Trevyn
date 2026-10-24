import type { Metadata } from "next"
import { SettingsView } from "@/components/admin/admin-views"
import { LiveSettings } from "@/components/admin/live-admin"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return apiEnabled ? <LiveSettings /> : <SettingsView />
}
