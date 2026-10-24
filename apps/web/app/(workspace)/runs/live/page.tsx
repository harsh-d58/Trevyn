import type { Metadata } from "next"
import { Suspense } from "react"
import { LiveRunView } from "@/components/runs/live-run-view"
import { LiveRunsPanel } from "@/components/runs/real-run-view"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Live run" }

/** ?run=<uuid> selects one run; without it the live tab selects an active run. */
export default function LiveRunPage(props: PageProps<"/runs/live">) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><Live searchParams={props.searchParams} /></Suspense>
}

async function Live({ searchParams }: { searchParams: PageProps<"/runs/live">["searchParams"] }) {
  const run = (await searchParams).run
  return apiEnabled ? <LiveRunsPanel runId={typeof run === "string" ? run : undefined} /> : <LiveRunView />
}
