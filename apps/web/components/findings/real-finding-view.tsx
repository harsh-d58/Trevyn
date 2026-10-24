// Finding detail backed by GET /api/findings/{id}: verdict checks, evidence, hypothesis (labelled), repair prompt.
import Link from "next/link"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, Severity } from "@/components/kit/pills"
import { API_URL, type ApiFindingDetail } from "@/lib/api"
import { RepairPanel } from "./repair-panel"
import { FlowMap } from "@/components/charts/flow-map"

const STATUS_TONE = { confirmed: "bad", needs_review: "warn", inconclusive: "mut" } as const

type Journey = { nodes: { id: string; label: string; sub: string; x: number; y: number; k?: "det" | "bad" }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

export function RealFindingView({ f, journey }: { f: ApiFindingDetail; journey?: Journey | null }) {
  const shots = f.evidence_items.filter((e) => e.kind === "screenshot_failure" || e.kind === "screenshot")
  const files = f.evidence_items.filter((e) => !e.kind.startsWith("screenshot"))
  const v = f.verdict_detail
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow={`${f.id} · ${f.test_case_id} · ${f.runId}`} title={f.title}><Severity s={f.severity} /><Pill tone={STATUS_TONE[f.status as keyof typeof STATUS_TONE] ?? "mut"}>{f.status}</Pill>
          <Link href={`/runs/live?run=${f.runUuid}`}><Pill tone="brand">Open run</Pill></Link></PageHeader>
      {journey?.nodes.length ? <Card title={`Journey · ${f.test_case_id}`}><div><FlowMap nodes={journey.nodes} edges={journey.edges} w={journey.w} h={journey.h} label="Test journey" /></div></Card> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="grid content-start gap-4">
          <Card title="Expected vs actual">
            <p className="text-[13px]"><b>Expected:</b> {f.expected}</p>
            <p className="mt-2 text-[13px] text-bad"><b>Actual:</b> {f.actual}</p>
          </Card>
          <Card title="Verifier" caption={`${v.rule} · reproduced ${v.reproduced}${v.reason ? ` · ${v.reason}` : ""}`}>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(v.checks).map(([k, ok]) => <Pill key={k} tone={ok === true ? "ok" : ok === false ? "bad" : "mut"}>{k}{typeof ok === "string" ? `: ${ok}` : ""}</Pill>)}
            </div>
          </Card>
          <Card title="Reproduction steps">
            <ol className="list-decimal space-y-1 pl-5 font-mono text-[12px]">
              {f.repro_steps.map((s, i) => <li key={i}>{s.action} {s.target} {s.value}</li>)}
            </ol>
          </Card>
          {f.diagnosis && (
            <Card title="Diagnosis" caption="Hypotheses, not verified facts">
              {f.diagnosis.hypotheses.map((h, i) => <p key={i} className="text-[13px]"><Pill tone="ai">{h.confidence}</Pill> {h.statement}</p>)}
              {!!f.diagnosis.unknowns.length && <p className="mt-2 text-xs text-muted-foreground">Unknown: {f.diagnosis.unknowns.join(" ")}</p>}
            </Card>)}
        </div>
        <div className="grid content-start gap-4">
          <Card title="Evidence" caption={`${f.evidence_items.length} items · SHA-256 recorded`}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {shots.slice(-6).map((e) => (
                <a key={e.id} href={`${API_URL}${e.url}`} target="_blank" rel="noreferrer" className="glass-inset block overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${API_URL}${e.url}`} alt={`${e.kind} evidence`} className="aspect-[16/10] w-full object-cover object-top" />
                </a>))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {files.map((e) => <a key={e.id} href={`${API_URL}${e.url}`} target="_blank" rel="noreferrer"><Pill tone="det">{e.kind} · {Math.ceil(e.bytes / 1024)} KB</Pill></a>)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Traces open in the Playwright trace viewer served by the Trevyn API.</p>
          </Card>
          {f.repair_prompt && (
            <Card title="Repair prompt" caption="Paste into your coding tool">
              <pre className="glass-inset max-h-80 overflow-auto rounded-lg p-3 font-mono text-[12px] whitespace-pre-wrap">{f.repair_prompt}</pre>
            </Card>)}
          <RepairPanel findingId={f.id} confirmed={f.status === "confirmed"} />
        </div>
      </div>
    </div>
  )
}
