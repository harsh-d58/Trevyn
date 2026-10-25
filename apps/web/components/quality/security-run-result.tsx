import { API_URL } from "@/lib/api"
import { FlowMap } from "@/components/charts/flow-map"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, type Tone } from "@/components/kit/pills"
import { plainFinding } from "@/lib/findings/plain-language"
import { ScrollCard } from "./scroll-card"

type Rule = { rule: string; status: string }
type Failure = { id: string; rule: string; severity: string; title: string; evidence: string[] }
type ZapAlert = { id: string; name: string; severity: string; confidence?: string | null; cwe?: string | number | null; urls?: string[]; evidence?: string[] }
type RepositoryFinding = { id: string; name: string; severity: string; package?: string | null; version?: string | null; fixed_version?: string | null; file?: string | null; line?: number | null; evidence?: string[] }
export type SecurityRunData = {
  run: { display_id: string; name: string; state: string }
  reason?: string | null
  summary?: { rules?: Record<string, string>; pages?: string[]; cases?: string[] } | null
  rules?: Rule[]; failures?: Failure[]; zap_status?: string; zap_alerts?: ZapAlert[]
  repository?: { status?: string; osv?: string; gitleaks?: string; findings?: RepositoryFinding[] }
}
export type SecurityGraph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

const RULES: Record<string, [string, string]> = {
  P1: ["Browser script policy", "Checks whether a Content Security Policy is sent."],
  P2: ["Protection against page embedding", "Checks whether other sites are prevented from placing this page in a frame."],
  P3: ["HTTPS-only instruction", "Checks whether HTTPS pages tell browsers to keep using HTTPS."],
  P4: ["File-type protection", "Checks whether browsers are told not to guess a response's file type."],
  P5: ["Session cookie protections", "Checks relevant session cookies for HttpOnly, Secure and SameSite."],
  P6: ["Software version exposure", "Checks whether response headers reveal software versions."],
  P7: ["Mixed-content requests", "Checks whether an HTTPS page loaded a resource over HTTP."],
  P8: ["Browser console errors", "Checks whether the page reported JavaScript errors during a journey."],
  P9: ["Server errors", "Checks whether the site returned a 5xx response during a journey."],
}
const tone = (status: string): Tone => status === "failed" || status === "issues found" ? "bad" : status === "passed" || status === "measured" ? "ok" : "mut"
const resultLabel = (status: string) => status === "failed" ? "Flagged" : status === "passed" ? "No issue seen" : status === "not applicable" ? "Not applicable" : status === "not run" ? "Not run" : status === "issues found" ? "Issues found" : status
const evidenceUrl = (value: string) => API_URL + (value.startsWith("/api/evidence/") ? value : `/api/evidence/${value}`)
const pagePath = (value: string) => { try { return new URL(value).pathname || "/" } catch { return value } }

export function SecurityRunResult({ data, diagrams }: { data: SecurityRunData; diagrams: { name: string; graph: SecurityGraph | null }[] }) {
  const passive = (data.rules ?? []).filter((item) => item.rule !== "ZAP baseline")
  const flagged = passive.filter((item) => item.status === "failed")
  const passed = passive.filter((item) => item.status === "passed")
  const notApplicable = passive.filter((item) => item.status === "not applicable")
  const failures = data.failures ?? []
  const zapAlerts = data.zap_alerts ?? []
  const repository = data.repository
  const repositoryFindings = repository?.findings ?? []
  const pages = [...new Set(data.summary?.pages ?? [])]
  const cases = [...new Set(data.summary?.cases ?? [])]

  return <div className="grid gap-3.5">
    <PageHeader title="Security" />

    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{passive.length ? `${flagged.length} of ${passive.length} passive checks flagged an issue` : "No passive security results recorded"}</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{passive.length ? "Passed means no issue was seen on sampled pages or captured traffic." : data.reason ?? "No passive checks recorded yet."}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]"><span><b>{passed.length}</b> checks saw no issue</span><span><b>{notApplicable.length}</b> not applicable</span><span><b>{pages.length}</b> pages sampled</span><span><b>{cases.length}</b> browser journeys reviewed</span></div>
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title={`Findings to review · ${failures.length}`}>
        {failures.length ? <div className="divide-y divide-border">{failures.map((finding) => {
          const plain = plainFinding({ type: finding.rule?.startsWith("passive:P8") ? "ui" : "security", title: finding.title })
          return <div key={finding.id} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-2"><Pill tone={finding.severity === "high" ? "bad" : "warn"}>{finding.severity || "Review"}</Pill><span className="font-mono text-[11px] text-muted-foreground">{finding.id}</span></div>
            <p className="mt-2 text-[13px] font-semibold">{plain.headline}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{plain.explanation}</p>
            {plain.headline !== finding.title && <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Original check</summary><p className="mt-1">{finding.title}</p></details>}
            <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-semibold text-brand">{(finding.evidence ?? []).map((item, i) => <a key={item} href={evidenceUrl(item)} target="_blank" rel="noreferrer" className="hover:underline">Evidence {i + 1}</a>)}</div>
          </div>
        })}</div> : <p className="text-[13px] text-muted-foreground">{passive.length ? "No passive or ZAP findings were recorded." : "No findings have been recorded for this run."}</p>}
      </ScrollCard>

      <ScrollCard title="Passive checks">
        {passive.length ? <div className="divide-y divide-border">{passive.map(({ rule, status }) => <div key={rule} className="py-2.5 first:pt-0">
          <div className="flex flex-wrap items-center gap-2"><Pill tone={tone(status)}>{resultLabel(status)}</Pill><b className="text-[13px]">{RULES[rule]?.[0] ?? rule}</b><span className="font-mono text-[10.5px] text-muted-foreground">{rule}</span></div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{RULES[rule]?.[1] ?? "See the recorded rule and evidence for details."}{status === "not applicable" ? " No relevant item was observed to assess." : ""}</p>
        </div>)}</div> : <p className="text-[13px] text-muted-foreground">No passive rule results were saved.</p>}
      </ScrollCard>

      <ScrollCard title="Scanner coverage" size="summary">
        <div className="grid gap-2 text-[12.5px]">
          <p className="flex items-center justify-between gap-3"><span>ZAP passive baseline</span><Pill tone={tone(data.zap_status ?? "not run")}>{resultLabel(data.zap_status ?? "not run")}</Pill></p>
          <p className="flex items-center justify-between gap-3"><span>Dependency advisory scan</span><Pill tone={tone(repository?.osv ?? "not run")}>{resultLabel(repository?.osv ?? "not run")}</Pill></p>
          <p className="flex items-center justify-between gap-3"><span>Exposed-secret scan</span><Pill tone={tone(repository?.gitleaks ?? "not run")}>{resultLabel(repository?.gitleaks ?? "not run")}</Pill></p>
        </div>
      </ScrollCard>

      <ScrollCard title="Pages sampled">
        {pages.length ? <div className="divide-y divide-border">{pages.map((page) => <div key={page} className="py-2.5 first:pt-0 text-[12.5px]"><b>{pagePath(page)}</b><p className="mt-1 break-all text-[11px] text-muted-foreground">{page}</p></div>)}</div> : <p className="text-[13px] text-muted-foreground">No sampled pages were recorded.</p>}
      </ScrollCard>

      {zapAlerts.length > 0 && <ScrollCard title="ZAP alerts">
        <div className="divide-y divide-border">{zapAlerts.map((alert) => {
          const plain = plainFinding({ type: "security", title: alert.name })
          return <div key={alert.id} className="py-2.5 first:pt-0"><p className="text-[13px] font-semibold">{plain.headline} <span className="font-mono text-[10.5px] text-muted-foreground">{alert.id}</span></p><p className="mt-1 text-[12px] text-muted-foreground">{plain.explanation}</p><p className="mt-1 text-[11px] text-muted-foreground">{alert.severity} severity{alert.confidence ? ` · ${alert.confidence} scanner confidence` : ""}{alert.cwe ? ` · CWE-${alert.cwe}` : ""}</p><p className="mt-1 text-[11px] text-muted-foreground">{alert.urls?.length ?? 0} affected URL{alert.urls?.length === 1 ? "" : "s"}</p>{(alert.evidence ?? []).map((item) => <a key={item} href={evidenceUrl(item)} target="_blank" rel="noreferrer" className="mt-1 mr-3 inline-block text-[12px] font-semibold text-brand hover:underline">Open evidence</a>)}</div>
        })}</div>
      </ScrollCard>}

      {repositoryFindings.length > 0 && <ScrollCard title="Repository scan findings">
        <div className="divide-y divide-border">{repositoryFindings.map((finding) => <div key={finding.id} className="py-2.5 first:pt-0"><p className="text-[13px] font-semibold">{finding.name}</p><p className="mt-1 text-[11.5px] text-muted-foreground">{finding.id} · {finding.severity}{finding.package ? ` · ${finding.package}${finding.version ? ` ${finding.version}` : ""}` : ""}{finding.fixed_version ? ` · fixed in ${finding.fixed_version}` : ""}</p>{finding.file && <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{finding.file}{finding.line ? `:${finding.line}` : ""}</p>}{(finding.evidence ?? []).map((item) => <a key={item} href={evidenceUrl(item)} target="_blank" rel="noreferrer" className="mt-1 mr-3 inline-block text-[12px] font-semibold text-brand hover:underline">Open evidence</a>)}</div>)}</div>
      </ScrollCard>}
    </div>

    {diagrams.some(({ graph }) => graph?.nodes.length) && <section aria-label="Security diagrams" className="grid gap-3.5">{diagrams.map(({ name, graph }) => graph?.nodes.length ? <ScrollCard key={name} title={`${name} map`} size="diagram"><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={name} /></ScrollCard> : null)}</section>}
  </div>
}
