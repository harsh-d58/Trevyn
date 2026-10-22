import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FindingDetailView } from "@/components/findings/finding-detail-view"
import { RealFindingView } from "@/components/findings/real-finding-view"
import { findingIds, getFindingEvidence } from "@/lib/data"
import { getLiveFinding } from "@/lib/live-data"

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
  if (live) return <RealFindingView f={live} />
  if (!findingIds().includes(id)) notFound()
  return <FindingDetailView id={id} data={await getFindingEvidence(id)} />
}
