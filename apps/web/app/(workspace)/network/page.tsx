import type { Metadata } from "next"
import { NetworkView } from "@/components/quality/network-view"

export const metadata: Metadata = { title: "Network & traces" }

export default function NetworkPage() {
  return <NetworkView />
}
