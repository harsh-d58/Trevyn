import type { Metadata } from "next"
import { CompatView } from "@/components/quality/quality-views"

export const metadata: Metadata = { title: "Compatibility" }

export default function CompatPage() {
  return <CompatView />
}
