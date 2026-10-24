"use client"
// Real test plans (blueprint Step 5): GET /api/plans list, GET /api/plans/{id} cases, approve/reject the selected version.
import Link from "next/link"
import { Check, Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, Severity, type Tone } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { ApiPlanSummary } from "@/lib/live-data"
import { notify } from "@/lib/notify"

type Case = { test_case_id: string; title: string; requirement_ref?: string | null; preconditions?: string[]; steps?: unknown[]; expected_result: string; risk?: "low" | "medium" | "high" }
type PlanDetail = { id: string; version: number; status: string; source: string; requirement: string; risk_level: string; test_cases: Case[] }
const STATUS_TONE: Record<string, Tone> = { approved: "ok", rejected: "bad", draft: "warn", pending: "human" }

export function LivePlansView({ plans: initial }: { plans: ApiPlanSummary[] }) {
  const [plans, setPlans] = useState(initial)
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null)
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sel) return
    let alive = true
    api<PlanDetail>(`/api/plans/${encodeURIComponent(sel)}`).then((d) => alive && setDetail(d)).catch((e: Error) => notify(e.message, "bad"))
    return () => { alive = false }
  }, [sel])

  const decide = async (decision: "approve" | "reject") => {
    if (!detail) return
    setBusy(true)
    try {
      const d = await api<PlanDetail>(`/api/plans/${encodeURIComponent(detail.id)}/${decision}`, { method: "POST" })
      setDetail(d)
      setPlans((ps) => ps.map((p) => (p.id === d.id ? { ...p, status: d.status } : p)))
      notify(`Plan v${d.version} ${d.status}`, decision === "approve" ? "ok" : "warn")
    } catch (e) { notify((e as Error).message, "bad") } finally { setBusy(false) }
  }

  const shown = detail && detail.id === sel ? detail : null
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="AI Test Planner" title="Test plans" sub="Every edit creates a new version. Approve a version before it runs.">
        <Button variant="brand" size="pill" render={<Link href="/planner" />}><Plus />New plan</Button>
      </PageHeader>
      <div className="grid gap-3.5 xl:grid-cols-[1fr_2fr]">
        <Card flush title={`${plans.length} plan${plans.length === 1 ? "" : "s"}`}>
          {plans.length === 0 && <p className="p-6 text-center text-[13px] text-muted-foreground">No plans yet. Generate one in the planner.</p>}
          {plans.length > 0 && (
            <DataTable head={["Requirement", "Ver", "Status", "Source", "Cases"]}>
              {plans.map((p) => (
                <Row key={p.id} onClick={() => setSel(p.id)} highlight={p.id === sel}>
                  <Cell className="max-w-56 truncate font-medium" title={p.requirement}><button className="max-w-full truncate text-left outline-none focus-visible:underline" onClick={() => setSel(p.id)}>{p.requirement}</button></Cell>
                  <Cell className="tabular">v{p.version}</Cell>
                  <Cell><Pill tone={STATUS_TONE[p.status] ?? "mut"}>{p.status}</Pill></Cell>
                  <Cell className="text-[12.5px] text-muted-foreground">{p.source}</Cell>
                  <Cell className="tabular">{p.cases}</Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Card>
        <Card flush title={shown ? `Plan v${shown.version} · ${shown.test_cases.length} cases` : sel ? "Loading plan…" : "Select a plan"}
          extra={shown && (
            <div className="flex items-center gap-2">
              <Pill tone={STATUS_TONE[shown.status] ?? "mut"}>{shown.status}</Pill>
              <Button variant="glass" size="pill-sm" disabled={busy || shown.status === "rejected"} onClick={() => decide("reject")}><X />Reject</Button>
              <Button variant="brand" size="pill-sm" disabled={busy || shown.status === "approved"} onClick={() => decide("approve")}><Check />Approve</Button>
            </div>)}>
          {shown && (
            <DataTable head={["Test ID", "Title", "Requirement", "Steps", "Expected", "Risk"]} minWidth={820}>
              {shown.test_cases.map((c) => (
                <Row key={c.test_case_id}>
                  <Cell className="font-mono text-[11.5px]">{c.test_case_id}</Cell>
                  <Cell className="min-w-44 font-medium">{c.title}</Cell>
                  <Cell className="font-mono text-[11px] text-muted-foreground">{c.requirement_ref ?? "—"}</Cell>
                  <Cell className="tabular">{c.steps?.length ?? 0}</Cell>
                  <Cell className="min-w-44 text-[12.5px]">{c.expected_result}</Cell>
                  <Cell><Severity s={c.risk ?? "low"} /></Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  )
}
