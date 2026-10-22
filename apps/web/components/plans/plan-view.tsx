"use client"
// Generated test plan (PORTING_PLAN.md P1.2, from trevyn-app Plans.jsx Plans).
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, Check, Sparkles } from "lucide-react"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { CheckLine, Note } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, Severity } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import type { getPlan } from "@/lib/data"
import { notify } from "@/lib/notify"

type Plan = Awaited<ReturnType<typeof getPlan>>
const STATE_TONE = { Validated: "ok", "Needs approval": "human", "Needs review": "warn" } as const

export function PlanView({ plan }: { plan: Plan }) {
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="AI Test Planner" title="Generated test plan" sub="Checkout · Plan v3 · built from 4 requirements and the PR #318 diff.">
        <Button variant="glass" size="pill" render={<Link href="/planner" />}>Edit plan</Button>
        <Button variant="brand" size="pill" onClick={() => notify("Plan v3 approved. 16 tests queued, 2 wait for approval.")}><Check />Approve &amp; run</Button>
      </PageHeader>

      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Plan pipeline">
        {plan.pipeline.map((s, i) => (
          <motion.li key={s} className="flex items-center gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Pill tone={i < plan.doneStages ? "ok" : "brand"}>{i < plan.doneStages && <Check size={12} />}{s}</Pill>
            {i < plan.pipeline.length - 1 && <ArrowRight size={12} className="text-muted-foreground" />}
          </motion.li>
        ))}
      </ol>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card flush title={`${plan.proposed} proposed · ${plan.validated} validated · ${plan.proposed - plan.validated} need review`} extra={<span className="text-[11.5px] text-muted-foreground">Showing {plan.rows.length}</span>}>
          <DataTable head={["Test ID", "Requirement", "Scenario", "Precondition", "Expected", "Mode", "Priority", "State"]} minWidth={980}>
            {plan.rows.map((r) => (
              <Row key={r.id}>
                <Cell className="font-mono text-[11.5px]">{r.id}</Cell>
                <Cell className="font-mono text-[11px] text-muted-foreground">{r.req}</Cell>
                <Cell className="min-w-44 font-medium">{r.scenario}</Cell>
                <Cell className="min-w-36 text-[12.5px] text-muted-foreground">{r.pre}</Cell>
                <Cell className="min-w-36 text-[12.5px]">{r.expected}</Cell>
                <Cell className="text-[12.5px] whitespace-nowrap">{r.mode}</Cell>
                <Cell><Severity s={r.priority} /></Cell>
                <Cell><Pill tone={STATE_TONE[r.state]}>{r.state}</Pill></Cell>
              </Row>
            ))}
          </DataTable>
        </Card>
        <Card title="Plan validation" caption="Self-checking plan · Trevyn verifies its own plan before running it">
          {plan.checks.map(([t, k]) => <CheckLine key={t} k={k}>{t}</CheckLine>)}
          <Note icon={Sparkles} className="mt-3">Quality over quantity: 9 low-value variants were dropped because they repeat existing coverage.</Note>
        </Card>
      </div>
    </div>
  )
}
