"use client"
// Regression suite (PORTING_PLAN.md P1.9, from Plans.jsx Regression). Reads the store's repair state:
// once the DEF-142 patch has passed regression, CHECKOUT-014's latest run shows passed.
import { Repeat } from "lucide-react"
import { useState } from "react"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { RunHistoryStrip } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { RunStatusPill } from "@/components/kit/pills"
import { StatStrip } from "@/components/kit/stat-strip"
import { Button } from "@/components/ui/button"
import type { getRegression } from "@/lib/data"
import { useLive } from "@/lib/live"
import { notify } from "@/lib/notify"

type Regression = Awaited<ReturnType<typeof getRegression>>

export function RegressionView({ data }: { data: Regression }) {
  const repaired = useLive((s) => s.repair === "done")
  const [busy, setBusy] = useState(false)
  const run = () => {
    setBusy(true)
    setTimeout(() => { setBusy(false); notify("Regression suite: 209 / 212 passed. 3 flaky tests quarantined.", "warn") }, 1800)
  }
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Regression suite" sub="Reusable automated tests that Trevyn reruns after every approved fix.">
        <Button variant="brand" size="pill" onClick={run} disabled={busy}><Repeat className={busy ? "animate-spin" : undefined} />{busy ? "Running…" : "Run full suite"}</Button>
      </PageHeader>
      <StatStrip items={data.kpis} />
      <Card flush title="Tests and last 20 runs" caption={repaired ? "CHECKOUT-014 passes on the patched build (AP-31)" : undefined}>
        <DataTable head={["Test", "Suite", "Origin", "History", "Last"]} minWidth={760}>
          {data.rows.map((r) => {
            const fixed = repaired && r.fixedBy === "DEF-142"
            return (
              <Row key={r.test} highlight={fixed}>
                <Cell className="min-w-56 font-medium">{r.test}</Cell>
                <Cell>{r.suite}</Cell>
                <Cell className="text-muted-foreground">{r.origin}</Cell>
                <Cell><RunHistoryStrip fail={fixed ? r.failRuns.filter((i) => i !== 19) : r.failRuns} warn={r.warnRun} /></Cell>
                <Cell><RunStatusPill s={fixed ? "passed" : r.last} /></Cell>
              </Row>
            )
          })}
        </DataTable>
      </Card>
    </div>
  )
}
