import { API_URL } from "@/lib/api"
import { plainFinding } from "@/lib/findings/plain-language"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Pill } from "@/components/kit/pills"
import { FlowMap } from "@/components/charts/flow-map"
import { cn } from "@/lib/utils"

type Step = { action: string; target?: string; value?: string }
type Assertion = { kind: string; subject: string; op: string; expected: unknown }
type Case = { test_case_id: string; title: string; steps: Step[]; assertions: Assertion[]; expected_result: string }
type Event = { case: string; summary: string; status: string }
type Evidence = { id: string; case: string; url: string | null }
type AccessibilityIssue = { case: string; path: string; rule: string; name: string; impact: string; nodes: number; evidence?: string }
type ConsoleCase = { case: string; messages: { type: string; text: string }[] }
export type UiRunData = {
  run: { id: string; display_id: string; name: string; state: string; counts?: Record<string, number> }
  reason?: string; cases?: Case[]; steps?: Event[]; assertions?: Event[]; verdicts?: Event[]
  screenshots?: Evidence[]; traces?: Evidence[]; console?: ConsoleCase[]; accessibility?: AccessibilityIssue[]
}
export type UiGraph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

function ScrollCard({ title, caption, children, size = "regular", className }: {
  title: string; caption?: string; children: React.ReactNode; size?: "summary" | "regular" | "diagram"; className?: string
}) {
  return <Card title={title} caption={caption} className={cn(size === "summary" ? "h-[210px]" : size === "diagram" ? "h-[440px]" : "h-[360px]", className)}>
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1" role="region" aria-label={`${title} content`} tabIndex={0}>{children}</div>
  </Card>
}

function pathOf(target?: string): string {
  if (!target) return "the page"
  try { return new URL(target).pathname || "/" } catch { return target }
}

function pageName(path: string): string {
  if (path === "/") return "Home page"
  const part = path.split("/").filter(Boolean).at(-1) ?? "page"
  if (/\.(png|jpe?g|webp|svg|gif)$/i.test(part)) return "Image file"
  return `${part.replace(/\.[^.]+$/, "").replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())} page`
}

function casePath(test: Case): string {
  const destination = test.assertions.find((a) => a.kind === "url")?.expected
  return pathOf(typeof destination === "string" ? destination : test.steps.find((s) => s.action === "goto")?.target)
}

function caseStatus(verdict?: Event): "passed" | "failed" | "waiting" {
  if (!verdict) return "waiting"
  if (verdict.status === "ok" && /\bpassed\b/i.test(verdict.summary)) return "passed"
  if (verdict.status === "failed" || /\b(confirmed|failed)\b/i.test(verdict.summary)) return "failed"
  return "waiting"
}

function failedCheck(test: Case, observed: Event[]): Assertion | undefined {
  const failedIndex = observed.findIndex((event) => event.status === "failed")
  return failedIndex < 0 ? undefined : test.assertions[failedIndex]
}

function expectation(a: Assertion): string {
  if (a.kind === "status" && a.expected === 200) return "Page opens successfully"
  if (a.kind === "count") return "Page renders content"
  if (a.kind === "ui_text") return `Page shows “${String(a.expected)}”`
  if (a.kind === "url") return `Navigation reaches ${String(a.expected)}`
  return `Check ${a.kind.replaceAll("_", " ")}: ${String(a.expected)}`
}

function stepText(step: Step): string {
  if (step.action === "goto") return `Open ${pathOf(step.target)}`
  if (step.action === "click") return `Click ${step.target?.replace(/^(text|css)=/, "") ?? "the control"}`
  if (step.action === "fill") return `Enter text into ${step.target?.replace(/^css=/, "") ?? "a field"}`
  return `${step.action.replaceAll("_", " ")} ${step.target ?? ""}`.trim()
}

function consoleMeaning(type: string, text: string): [string, string] {
  if (/Failed to load resource|ERR_FAILED/i.test(text)) return ["A page resource did not load", "This can come from the site or a blocked network request. Check the affected page before treating it as a site defect."]
  if (/preload assets/i.test(text)) return ["A preloaded file did not load", "A file requested early by the page was unavailable during the test."]
  if (/postMessage.*origin/i.test(text)) return ["A cross-window message went to a different origin", "An embedded frame or script may be using a different site address than expected."]
  if (/attribute d: Expected number/i.test(text)) return ["A graphic could not be drawn correctly", "The browser rejected a value used to draw an SVG shape."]
  return [type === "warning" ? "The browser recorded a warning" : "The browser recorded an error", "Open the technical message to see the browser's exact wording."]
}

export function UiRunResult({ data, diagrams }: { data: UiRunData; diagrams: { name: string; graph: UiGraph | null }[] }) {
  const cases = data.cases ?? []
  const verdicts = data.verdicts ?? []
  const assertions = data.assertions ?? []
  const screenshots = (data.screenshots ?? []).filter((e) => e.url)
  const traces = (data.traces ?? []).filter((e) => e.url)
  const accessibility = data.accessibility ?? []
  const consoleCases = data.console ?? []
  const verdictByCase = new Map(verdicts.map((v) => [v.case, v]))
  const failed = cases.filter((c) => caseStatus(verdictByCase.get(c.test_case_id)) === "failed")
  const passed = cases.filter((c) => caseStatus(verdictByCase.get(c.test_case_id)) === "passed").length
  const finished = verdicts.length
  const total = data.run.counts?.total ?? cases.length

  const accessibilityGroups = new Map<string, { issue: AccessibilityIssue; count: number; paths: Set<string> }>()
  for (const issue of accessibility) {
    const group = accessibilityGroups.get(issue.rule)
    if (group) { group.count += 1; group.paths.add(issue.path) }
    else accessibilityGroups.set(issue.rule, { issue, count: 1, paths: new Set([issue.path]) })
  }
  const messages = new Map<string, { type: string; text: string; count: number; cases: Set<string> }>()
  for (const item of consoleCases) for (const message of item.messages) {
    const key = `${message.type}\u0000${message.text}`
    const group = messages.get(key)
    if (group) { group.count += 1; group.cases.add(item.case) }
    else messages.set(key, { ...message, count: 1, cases: new Set([item.case]) })
  }
  const errors = [...messages.values()].filter((m) => m.type === "error").reduce((sum, m) => sum + m.count, 0)
  const warnings = [...messages.values()].filter((m) => m.type === "warning").reduce((sum, m) => sum + m.count, 0)

  const firstFailure = failed[0]
  const firstFailedCheck = firstFailure && failedCheck(firstFailure, assertions.filter((a) => a.case === firstFailure.test_case_id))
  const failedText = firstFailedCheck?.kind === "ui_text" ? firstFailedCheck.expected : null
  const failureSummary = firstFailure ? (failedText
    ? `On ${casePath(firstFailure)}, the expected text “${String(failedText)}” was not found.`
    : `${pageName(casePath(firstFailure))} did not meet one of its expected checks.`) : "No browser check failed in the recorded results."

  return <div className="grid gap-3.5">
    <PageHeader eyebrow="Quality engineering" title="Browser & UI testing" sub={`${data.run.display_id} · ${data.run.name.trim()} · ${data.run.state.replaceAll("_", " ").toLowerCase()}`} />

    <ScrollCard title="The result" caption="What the browser checks established in this run" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{finished ? `${passed} of ${total} browser checks passed` : "Browser checks have not finished yet"}</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{failed.length ? failureSummary : finished ? "The recorded browser checks matched their expected results." : "Results will appear as the run records each check."}</p>
      {data.reason && <p className="mt-2 text-[12px] text-muted-foreground">{data.reason}</p>}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
        <span><b className="text-foreground">{failed.length}</b> check{failed.length === 1 ? " needs" : "s need"} attention</span>
        <span><b className="text-foreground">{accessibility.length}</b> accessibility observations</span>
        <span><b className="text-foreground">{errors}</b> browser errors to review</span>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Accessibility and console observations are separate from the {total} planned browser checks.</p>
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title="Needs attention" caption="Checks that did not match the plan">
        {failed.length ? <div className="divide-y divide-border">
          {failed.map((test) => <div key={test.test_case_id} className="py-3 first:pt-0">
            <div className="flex items-center gap-2"><Pill tone="bad">Needs attention</Pill><span className="font-mono text-[11px] text-muted-foreground">{test.test_case_id}</span></div>
            <p className="mt-2 text-[14px] font-semibold">{failedText && test === firstFailure ? "Expected page text was missing" : `${pageName(casePath(test))} did not pass`}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{test === firstFailure ? failureSummary : `The recorded result for ${casePath(test)} did not match the test plan.`}</p>
            <p className="mt-3 text-[12px] font-semibold">What to check next</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{failedCheck(test, assertions.filter((a) => a.case === test.test_case_id))?.kind === "ui_text" ? "Check whether the expected wording changed intentionally. Update the test if it did; otherwise, fix the page content." : "Compare the expected behavior with what the browser recorded, then check whether the page or the test needs changing."}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-semibold text-brand">
              {screenshots.filter((shot) => shot.case === test.test_case_id).slice(0, 1).map((shot) => <a key={shot.id} href={API_URL + shot.url} target="_blank" rel="noreferrer" className="hover:underline">View screenshot</a>)}
              {traces.filter((trace) => trace.case === test.test_case_id).slice(0, 1).map((trace) => <a key={trace.id} href={API_URL + trace.url} target="_blank" rel="noreferrer" className="hover:underline">Open recording</a>)}
            </div>
            <details className="mt-2 text-[11.5px] text-muted-foreground"><summary className="w-fit cursor-pointer">Original test</summary><p className="mt-1">{test.title}</p></details>
          </div>)}
        </div> : <p className="text-[13px] text-muted-foreground">{finished ? "No failed browser checks were recorded." : "This section will update when checks finish."}</p>}
      </ScrollCard>

      <ScrollCard title="Pages and journeys" caption={`${cases.length} planned checks · open a row to see what was tested`}>
        {cases.length ? <div className="divide-y divide-border">
          {cases.map((test) => {
            const status = caseStatus(verdictByCase.get(test.test_case_id))
            const observed = assertions.filter((a) => a.case === test.test_case_id)
            return <details key={test.test_case_id} className="py-2.5 first:pt-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-brand">
                <span className="min-w-0"><b className="block truncate text-[13px]">{test.test_case_id.startsWith("NAV") ? `Navigation to ${casePath(test)}` : pageName(casePath(test))}</b><span className="font-mono text-[10.5px] text-muted-foreground">{test.test_case_id} · {casePath(test)}</span></span>
                <Pill tone={status === "passed" ? "ok" : status === "failed" ? "bad" : "mut"}>{status === "passed" ? "Passed" : status === "failed" ? "Needs attention" : "Pending"}</Pill>
              </summary>
              <div className="mt-2 grid gap-1.5 rounded-xl bg-black/[.035] px-3 py-2 text-[12px]">
                {test.steps.map((step, i) => <p key={i}>{i + 1}. {stepText(step)}</p>)}
                {test.assertions.map((a, i) => <p key={i} className="text-muted-foreground"><span className={observed[i]?.status === "failed" ? "text-bad" : "text-ok"}>{observed[i]?.status === "failed" ? "Did not match" : observed[i] ? "Matched" : "Not recorded"}</span> · {expectation(a)}</p>)}
                <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Original tool results</summary>{observed.map((a) => <p key={a.summary} className="mt-1 break-words">{a.summary}</p>)}</details>
              </div>
            </details>
          })}
        </div> : <p className="text-[13px] text-muted-foreground">No planned browser checks were recorded for this run.</p>}
      </ScrollCard>

      <ScrollCard title="Accessibility" caption={`${accessibility.length} observations across ${accessibilityGroups.size} check types; review the affected pages`}>
        {accessibilityGroups.size ? <div className="divide-y divide-border">
          {[...accessibilityGroups.values()].sort((a, b) => b.count - a.count).map(({ issue, count, paths }) => {
            const plain = plainFinding({ type: "accessibility", title: issue.name })
            return <div key={issue.rule} className="py-2.5 first:pt-0">
              <p className="text-[13px] font-semibold">{plain.headline}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{plain.explanation}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{count} observation{count === 1 ? "" : "s"} · {paths.size} page{paths.size === 1 ? "" : "s"}</p>
              <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Affected pages and rule</summary><p className="mt-1 break-words">{[...paths].join(", ")} · {issue.rule}</p>{issue.evidence && <a className="text-brand underline" href={API_URL + issue.evidence} target="_blank" rel="noreferrer">View scanner evidence</a>}</details>
            </div>
          })}
        </div> : <p className="text-[13px] text-muted-foreground">No accessibility observations were recorded in this run.</p>}
      </ScrollCard>

      <ScrollCard title="Browser messages" caption={`${errors} errors · ${warnings} warnings; these need context before calling them site defects`}>
        {messages.size ? <div className="divide-y divide-border">
          {[...messages.values()].sort((a, b) => b.count - a.count).map((message) => {
            const [headline, explanation] = consoleMeaning(message.type, message.text)
            return <div key={`${message.type}:${message.text}`} className="py-2.5 first:pt-0">
              <p className="text-[13px] font-semibold">{headline}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{explanation}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{message.count} time{message.count === 1 ? "" : "s"} in {message.cases.size} check{message.cases.size === 1 ? "" : "s"}</p>
              <details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Technical message</summary><p className="mt-1 break-words font-mono">{message.text}</p></details>
            </div>
          })}
        </div> : <p className="text-[13px] text-muted-foreground">No browser console messages were recorded.</p>}
      </ScrollCard>

      <ScrollCard title="Screenshots" caption={`${screenshots.length} captured views; select one to inspect the page`}>
        {screenshots.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {screenshots.map((shot) => <a key={shot.id} href={API_URL + shot.url} target="_blank" rel="noreferrer" className="glass-inset overflow-hidden rounded-xl hover:outline-2 hover:outline-brand/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={API_URL + shot.url} alt={`Browser screenshot for ${shot.case}`} loading="lazy" className="aspect-video w-full object-cover object-top" />
            <span className="block truncate px-2 py-1.5 font-mono text-[11px]">{shot.case}</span>
          </a>)}
        </div> : <p className="text-[13px] text-muted-foreground">No screenshots were saved for this run.</p>}
      </ScrollCard>

      <ScrollCard title="Browser recordings" caption={`${traces.length} recorded journeys for technical review`}>
        {traces.length ? <div className="divide-y divide-border">
          {traces.map((trace) => <div key={trace.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <span className="font-mono text-[11.5px]">{trace.case}</span><a href={API_URL + trace.url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-brand hover:underline">Open recording</a>
          </div>)}
        </div> : <p className="text-[13px] text-muted-foreground">No browser recordings were saved for this run.</p>}
      </ScrollCard>
    </div>

    {diagrams.some(({ graph }) => graph?.nodes.length) && <section aria-label="Run diagrams" className="grid gap-3.5">
      <div><h2 className="text-[17px] font-semibold">Maps of the run</h2><p className="mt-1 text-[12.5px] text-muted-foreground">These diagrams show coverage and navigation after the written results above.</p></div>
      {diagrams.map(({ name, graph }) => graph?.nodes.length ? <ScrollCard key={name} title={name} caption="Scroll inside this map to explore every node" size="diagram">
        <FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={name} />
      </ScrollCard> : null)}
    </section>}
  </div>
}
