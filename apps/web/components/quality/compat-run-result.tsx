import { FlowMap } from "@/components/charts/flow-map"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, type Tone } from "@/components/kit/pills"
import { plainFinding } from "@/lib/findings/plain-language"
import { ScrollCard } from "./scroll-card"

type MatrixRow = { case: string; browser: string; status: string; note: string }
type AccessibilityRow = { case: string; path: string; rule: string; impact: string; name: string; help_url?: string; nodes?: number }
export type CompatRunData = {
  run: { display_id: string; name: string; state: string }
  reason?: string | null
  environment?: { browser?: string; version?: string; os?: string; os_version?: string; viewport?: { width?: number; height?: number } } | null
  other_browsers?: string; matrix?: MatrixRow[]; accessibility?: AccessibilityRow[]
}
export type CompatGraph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

const tone = (status: string): Tone => status === "passed" ? "ok" : status === "failed" ? "bad" : status === "errored" ? "warn" : "mut"
const label = (status: string) => status === "passed" ? "Passed" : status === "failed" ? "Failed" : status === "errored" ? "Could not complete" : "Not run"
const browserLabel = (browser: string) => browser === "iPhone 13" ? "iPhone 13 · mobile WebKit" : browser === "webkit" ? "WebKit · desktop" : browser === "firefox" ? "Firefox · desktop" : browser
const noteMeaning = (note: string) => note === "lane time limit" ? "The compatibility lane ran out of time before this case started." : note === "case exceeded 90 s in this browser" ? "This case exceeded its 90-second limit; no pass or fail was recorded." : note === "side effects or risk" ? "This case was excluded from browser replay because it could change data or had a higher risk." : note === "browser unavailable" ? "The browser could not be started in this environment." : note ? note.replace(/^step error:\s*/i, "A browser step stopped: ") : "No result was recorded."

export function CompatRunResult({ data, diagrams }: { data: CompatRunData; diagrams: { name: string; graph: CompatGraph | null }[] }) {
  const matrix = data.matrix ?? []
  const accessibility = data.accessibility ?? []
  const completed = matrix.filter((row) => ["passed", "failed", "errored"].includes(row.status))
  const passed = matrix.filter((row) => row.status === "passed")
  const failed = matrix.filter((row) => row.status === "failed")
  const errored = matrix.filter((row) => row.status === "errored")
  const notRun = matrix.filter((row) => row.status === "not run")
  const browsers = [...new Set(matrix.map((row) => row.browser))]
  const cases = [...new Set(matrix.map((row) => row.case))]
  const issues = matrix.filter((row) => row.status === "failed" || row.status === "errored")
  const reasons = new Map<string, number>()
  for (const row of notRun) reasons.set(row.note || "No reason recorded", (reasons.get(row.note || "No reason recorded") ?? 0) + 1)
  const accessibilityGroups = new Map<string, { row: AccessibilityRow; count: number; nodes: number; paths: Set<string> }>()
  for (const row of accessibility) {
    const group = accessibilityGroups.get(row.rule)
    if (group) { group.count += 1; group.nodes += row.nodes ?? 0; group.paths.add(row.path) }
    else accessibilityGroups.set(row.rule, { row, count: 1, nodes: row.nodes ?? 0, paths: new Set([row.path]) })
  }
  const env = data.environment

  return <div className="grid gap-3.5">
    <PageHeader title="Compatibility" />

    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{matrix.length ? `${completed.length} of ${matrix.length} browser replays completed` : "No cross-browser replay results recorded"}</p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{matrix.length ? `${passed.length} passed · ${failed.length} failed · ${errored.length} interrupted · ${notRun.length} not run. Unrun cases have no compatibility result.` : data.reason ?? "No browser replays recorded yet."}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]"><span><b>{browsers.length}</b> browser setups</span><span><b>{cases.length}</b> planned cases</span><span><b>{accessibility.length}</b> separate accessibility observations</span></div>
    </ScrollCard>

    <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title="Browser coverage">
        {browsers.length ? <div className="divide-y divide-border">{browsers.map((browser) => {
          const rows = matrix.filter((row) => row.browser === browser)
          const ok = rows.filter((row) => row.status === "passed").length
          const bad = rows.filter((row) => row.status === "failed").length
          const interrupted = rows.filter((row) => row.status === "errored").length
          const missing = rows.filter((row) => row.status === "not run").length
          return <div key={browser} className="py-3 first:pt-0"><p className="text-[13px] font-semibold">{browserLabel(browser)}</p><p className="mt-1 text-[12px] text-muted-foreground">{ok} passed · {bad} failed · {interrupted} interrupted · {missing} not run</p><div className="mt-2 flex h-2 overflow-hidden rounded-full bg-black/5" aria-hidden="true">{ok > 0 && <span className="bg-ok" style={{ width: `${100 * ok / rows.length}%` }} />}{bad > 0 && <span className="bg-bad" style={{ width: `${100 * bad / rows.length}%` }} />}{interrupted > 0 && <span className="bg-warn" style={{ width: `${100 * interrupted / rows.length}%` }} />}</div></div>
        })}</div> : <p className="text-[13px] text-muted-foreground">No browser matrix was saved for this run.</p>}
      </ScrollCard>

      <ScrollCard title={`Missing results · ${notRun.length}`}>
        {reasons.size ? <div className="divide-y divide-border">{[...reasons].sort((a, b) => b[1] - a[1]).map(([note, count]) => <div key={note} className="py-3 first:pt-0"><p className="text-[13px] font-semibold">{count} replay{count === 1 ? "" : "s"}</p><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{noteMeaning(note)}</p><details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Affected cases</summary><p className="mt-1">{notRun.filter((row) => (row.note || "No reason recorded") === note).map((row) => `${row.case} in ${row.browser}`).join(", ")}</p></details></div>)}</div> : <p className="text-[13px] text-muted-foreground">{matrix.length ? "Every planned browser replay has a result." : "No browser replays were recorded."}</p>}
      </ScrollCard>

      {issues.length > 0 && <ScrollCard title="Differences to investigate" caption="An interruption is not a confirmed site defect">
        {issues.length ? <div className="divide-y divide-border">{issues.map((row) => <div key={`${row.case}:${row.browser}`} className="py-2.5 first:pt-0"><div className="flex flex-wrap items-center gap-2"><Pill tone={tone(row.status)}>{label(row.status)}</Pill><b className="text-[13px]">{row.case} in {browserLabel(row.browser)}</b></div><p className="mt-1 text-[12px] text-muted-foreground">{row.note ? noteMeaning(row.note) : row.status === "failed" ? "The replay did not match its expected outcome. Compare this case with the primary browser result." : "The replay stopped before it could give a result."}</p></div>)}</div> : <p className="text-[13px] text-muted-foreground">{completed.length ? "No completed replay reported a browser-specific failure. The missing cases still need coverage." : "No completed replay is available to compare."}</p>}
      </ScrollCard>}

      <ScrollCard title={`Case results · ${cases.length}`}>
        {cases.length ? <div className="divide-y divide-border">{cases.map((testCase) => <details key={testCase} className="py-2.5 first:pt-0"><summary className="flex cursor-pointer items-center justify-between gap-3 text-[12.5px]"><b className="font-mono">{testCase}</b><span className="text-muted-foreground">{matrix.filter((row) => row.case === testCase && row.status === "passed").length}/{browsers.length} passed</span></summary><div className="mt-2 grid gap-2">{matrix.filter((row) => row.case === testCase).map((row) => <div key={row.browser} className="text-[12px]"><span className="inline-flex flex-wrap items-center gap-2"><span className="w-40">{browserLabel(row.browser)}</span><Pill tone={tone(row.status)}>{label(row.status)}</Pill></span>{row.note && <p className="mt-1 text-[11.5px] text-muted-foreground">{noteMeaning(row.note)}</p>}</div>)}</div></details>)}</div> : <p className="text-[13px] text-muted-foreground">No case matrix was recorded.</p>}
      </ScrollCard>

      <ScrollCard title="Primary browser" size="summary">
        {env ? <><p className="text-[17px] font-semibold">{env.browser || "Browser unknown"} {env.version || ""}</p><p className="mt-2 text-[12.5px] text-muted-foreground">{env.os || "Operating system unknown"} {env.os_version || ""} · {env.viewport ? `${env.viewport.width} × ${env.viewport.height} viewport` : "Viewport not recorded"}</p></> : <p className="text-[13px] text-muted-foreground">The primary browser and viewport were not recorded.</p>}
      </ScrollCard>

      <ScrollCard title={`Accessibility · ${accessibility.length}`} caption="Separate from browser replay results">
        {accessibilityGroups.size ? <div className="divide-y divide-border">{[...accessibilityGroups.values()].sort((a, b) => b.count - a.count).map(({ row, count, nodes, paths }) => {
          const plain = plainFinding({ type: "accessibility", title: row.name })
          return <div key={row.rule} className="py-2.5 first:pt-0"><p className="text-[13px] font-semibold">{plain.headline}</p><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{plain.explanation}</p><p className="mt-1 text-[11.5px] text-muted-foreground">{count} observation{count === 1 ? "" : "s"} · {paths.size} page{paths.size === 1 ? "" : "s"} · {nodes} affected element{nodes === 1 ? "" : "s"}</p><details className="mt-1 text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer">Pages and scanner rule</summary><p className="mt-1 break-words">{[...paths].join(", ")} · {row.rule}</p>{row.help_url?.startsWith("https://") && <a href={row.help_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">Rule details</a>}</details></div>
        })}</div> : <p className="text-[13px] text-muted-foreground">No accessibility observations were recorded in this run.</p>}
      </ScrollCard>
    </div>

    {diagrams.some(({ graph }) => graph?.nodes.length) && <section aria-label="Compatibility diagrams" className="grid gap-3.5">{diagrams.map(({ name, graph }) => graph?.nodes.length ? <ScrollCard key={name} title={`${name} map`} size="diagram"><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={name} /></ScrollCard> : null)}</section>}
  </div>
}
