import type { Metadata } from "next"
import { Suspense } from "react"
import { LiveRunView } from "@/components/runs/live-run-view"
import { RealRunView } from "@/components/runs/real-run-view"
import { apiEnabled } from "@/lib/api"

export const metadata: Metadata = { title: "Live run" }

/** ?run=RUN-2481 streams a real run from the API; without it, the scripted demo run plays */
export default function LiveRunPage(props: PageProps<"/runs/live">) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><Live searchParams={props.searchParams} /></Suspense>
}

async function Live({ searchParams }: { searchParams: PageProps<"/runs/live">["searchParams"] }) {
  const run = (await searchParams).run
  return apiEnabled && typeof run === "string" ? <RealRunView runId={run} /> : <LiveRunView />
}
