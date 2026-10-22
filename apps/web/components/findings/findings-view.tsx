"use client"
// Findings list (PORTING_PLAN.md P1.5, from Board.jsx FindingsList).
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Columns3 } from "lucide-react"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { ConfRing } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Avatar, FindingTypePill, Pill, Severity } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import { columnName } from "@/lib/demo/core"
import { useFindingFilter } from "./finding-filter"

export function FindingsWithParams() {
  return <FindingsView type={useSearchParams().get("type")} />
}

export function FindingsView({ type }: { type?: string | null }) {
  const router = useRouter()
  const [list, bar] = useFindingFilter(type)
  const open = list.filter((f) => f.column !== "verified").length, high = list.filter((f) => f.severity === "high").length
  const unc = list.filter((f) => f.verdict === "inconclusive").length
  const avg = list.length ? Math.round(list.reduce((a, f) => a + f.confidence, 0) / list.length) : 0
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Findings" sub="Evidence-backed bug reports. Every claim links to a trace, a log or a diff.">
        <Button variant="glass" size="pill" render={<Link href="/board" />}><Columns3 />Board view</Button>
      </PageHeader>
      <StatStrip items={[["Open findings", open, `of ${list.length} shown`, "det"], ["High severity", high, "Needs triage first", "bad"], ["Inconclusive", unc, "Awaiting human review", "warn"], ["Avg AI confidence", `${avg}%`, "Across shown findings", "ai"]]} />
      {bar}
      <Card flush>
        <DataTable head={["ID", "Title", "Type", "Severity", "Status", "Verdict", "Confidence", "Evidence", "Owner"]} minWidth={980}>
          {list.map((f) => (
            <Row key={f.id} onClick={() => router.push(`/findings/${f.id}`)}>
              <Cell className="font-mono text-[11.5px]"><Link href={`/findings/${f.id}`} onClick={(e) => e.stopPropagation()}>{f.id}</Link></Cell>
              <Cell className="min-w-56 font-medium">{f.title}</Cell>
              <Cell><FindingTypePill t={f.type} /></Cell>
              <Cell><Severity s={f.severity} /></Cell>
              <Cell><Pill>{columnName(f.column)}</Pill></Cell>
              <Cell><Pill tone={f.verdict === "confirmed" ? "ok" : f.verdict === "inconclusive" ? "warn" : "human"}>{f.verdict[0].toUpperCase() + f.verdict.slice(1)}</Pill></Cell>
              <Cell><div className="flex items-center gap-2"><ConfRing p={f.confidence} /><span className="text-[11.5px] tabular">{f.confidence}%</span></div></Cell>
              <Cell className="tabular">{f.evidence}</Cell>
              <Cell><Avatar k={f.owner} /></Cell>
            </Row>
          ))}
          {list.length === 0 && <Row><Cell colSpan={9} className="py-8 text-center text-muted-foreground">No findings match this filter.</Cell></Row>}
        </DataTable>
      </Card>
    </div>
  )
}
