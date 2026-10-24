import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FindingDetailView } from "@/components/findings/finding-detail-view"
import { RealFindingView } from "@/components/findings/real-finding-view"
import { findingIds, getFindingEvidence } from "@/lib/data"
import { getLiveFinding } from "@/lib/live-data"
import { apiEnabled, tryApi } from "@/lib/api"

export const generateStaticParams = async () => findingIds().map((id) => ({ id }))

export async function generateMetadata(props: PageProps<"/findings/[id]">): Promise<Metadata> {
  const { id } = await props.params
  return { title: id }
}

export default function FindingPage(props: PageProps<"/findings/[id]">) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><Finding params={props.params} /></Suspense>
}

async function Finding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const live = await getLiveFinding(id)
  if (live) {
    const journey = await tryApi<{ nodes: { id: string; label: string; sub: string; x: number; y: number; k?: "det" | "bad" }[];
      edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }>(`/api/runs/${encodeURIComponent(live.runUuid)}/diagrams/journey?case=${encodeURIComponent(live.test_case_id)}`)
    return <RealFindingView f={live} journey={journey} />
  }
  if (apiEnabled) notFound()
  if (!findingIds().includes(id)) notFound()
  return <FindingDetailView id={id} data={await getFindingEvidence(id)} />
}
