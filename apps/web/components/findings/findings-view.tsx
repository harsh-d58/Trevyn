"use client"
// A reader-first findings list. Tool wording and triage metadata remain available on demand.
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowUpRight, Columns3 } from "lucide-react"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { FindingTypePill, Pill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import { columnName } from "@/lib/demo/core"
import { plainFinding } from "@/lib/findings/plain-language"
import type { Finding } from "@/lib/types"
import { useFindingFilter } from "./finding-filter"

const PRIORITY: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_LABEL: Record<Finding["severity"], string> = { high: "High priority", medium: "Medium priority", low: "Low priority" }

export function FindingsWithParams() {
  return <FindingsView type={useSearchParams().get("type")} />
}

export function FindingsView({ type }: { type?: string | null }) {
  const [list, bar] = useFindingFilter(type)
  const ordered = [...list].sort((a, b) => PRIORITY[a.severity] - PRIORITY[b.severity])
  const byIssue = new Map<string, { plain: ReturnType<typeof plainFinding>; findings: Finding[] }>()
  for (const finding of ordered) {
    const plain = plainFinding(finding)
    const key = [finding.runId, finding.type, plain.headline, plain.location].join("\u0000")
    const group = byIssue.get(key)
    if (group) group.findings.push(finding)
    else byIssue.set(key, { plain, findings: [finding] })
  }
  const groups = [...byIssue.values()]
  const high = groups.filter((g) => g.findings.some((f) => f.severity === "high")).length
  const review = groups.filter((g) => g.findings.some((f) => f.verdict !== "confirmed")).length
  const withEvidence = groups.filter((g) => g.findings.some((f) => f.evidence > 0)).length

  return (
    <div className="grid gap-3.5">
      <PageHeader title="Findings" sub="Issues spotted during testing, explained in plain language. Open one to see its evidence and technical details.">
        <Button variant="glass" size="pill" render={<Link href="/board" />}><Columns3 />Board view</Button>
      </PageHeader>
      <StatStrip items={[["Issues shown", groups.length, `${list.length} individual findings`, "det"], ["High priority", high, "Look at these first", "bad"], ["Need a closer look", review, "Not yet confirmed", "warn"], ["With evidence", withEvidence, "Open to inspect it", "brand"]]} />
      {bar}
      <Card title="What we found" caption="Similar checks from the same run are grouped together. High priority items appear first." flush>
        <div className="divide-y divide-border">
          {groups.map(({ plain, findings }) => {
            const f = findings[0]
            const href = `/findings/${encodeURIComponent(f.id)}`
            const reviewLabel = findings.some((item) => item.verdict === "inconclusive") ? "Needs review" :
              findings.some((item) => item.verdict === "likely") ? "Review suggested" : "Detected"
            return (
              <article key={f.id} className="px-4 py-4 transition-colors hover:bg-white/45 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "mut"}>{PRIORITY_LABEL[f.severity]}</Pill>
                      <FindingTypePill t={f.type} />
                      <span className="text-[11px] text-muted-foreground">{findings.length > 1 ? `${findings.length} related findings` : f.id}</span>
                    </div>
                    <h3 className="mt-2 text-[15px] font-semibold leading-snug">
                      <Link href={href} className="rounded-sm hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{plain.headline}</Link>
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{plain.explanation}</p>
                    {(plain.location || f.runId) && <p className="mt-2 text-[11.5px] text-muted-foreground">
                      {plain.location && <span>Where: <span className="font-mono text-foreground">{plain.location}</span></span>}
                      {plain.location && f.runId && <span className="mx-2">·</span>}
                      {f.runId && <span>Run {f.runId}</span>}
                    </p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:pt-0.5">
                    <Pill tone={reviewLabel === "Detected" ? "ok" : "warn"}>{reviewLabel}</Pill>
                    <Link href={href} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">{findings.length > 1 ? "View example" : "View details"}<ArrowUpRight size={13} /></Link>
                  </div>
                </div>
                <details className="mt-3 text-[11.5px] text-muted-foreground">
                  <summary className="w-fit cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand">{findings.length > 1 ? `Show ${findings.length} individual findings` : "Technical details"}</summary>
                  <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto rounded-xl bg-black/[.035] px-3 py-2" tabIndex={0}>
                    {findings.map((item) => <p key={item.id}>
                      <Link href={`/findings/${encodeURIComponent(item.id)}`} className="font-mono font-semibold text-brand hover:underline">{item.id}</Link>
                      {" · "}{item.title}{" · "}{item.evidence} evidence item{item.evidence === 1 ? "" : "s"}{" · "}{columnName(item.column)}
                    </p>)}
                  </div>
                </details>
              </article>
            )
          })}
          {list.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No findings match these filters. Try another category or search term.</p>}
        </div>
      </Card>
    </div>
  )
}
