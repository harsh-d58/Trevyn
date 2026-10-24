// All live quality and planning pages read the selected run's persisted API projection.
import { API_URL, tryApi } from "@/lib/api"
import { scopedRun } from "@/lib/scope-server"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { Empty, PageLoading } from "@/components/kit/page-loading"
import { FlowMap } from "@/components/charts/flow-map"

type RecordValue = Record<string, unknown>
type RunViewData = RecordValue & { run: { id: string; display_id: string; name: string; state: string } }
type Graph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }

const TITLES: Record<string, string> = {
  plan: "Test plan", planner: "AI test planner", ui: "Browser & UI testing", "api-calls": "API & integration testing",
  perf: "Performance testing", security: "Security testing", environment: "Compatibility",
  repairs: "Repair assistant", regression: "Regression suite", policy: "Policies", usage: "Run usage",
}
const DIAGRAMS: Record<string, string[]> = {
  planner: ["site-map", "coverage", "repository"], ui: ["coverage", "journey"],
  "api-calls": ["api"], security: ["security"], repairs: ["root-cause"], regression: ["regression"],
  perf: ["performance"], environment: ["compatibility"],
}
const label = (s: string) => s.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())

function Value({ value, field }: { value: unknown; field?: string }) {
  if (value == null) return <span className="text-muted-foreground">Not recorded</span>
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>
  if (typeof value === "object") {
    if (Array.isArray(value)) return <>{value.length ? value.map((v) => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ") : "None"}</>
    return <span className="font-mono text-[11px] break-all">{JSON.stringify(value)}</span>
  }
  const text = String(value)
  if (field === "cwe" && /^\d+$/.test(text)) return <a className="text-brand underline" href={`https://cwe.mitre.org/data/definitions/${text}.html`} target="_blank" rel="noreferrer">CWE-{text}</a>
  if (field === "help_url" && text.startsWith("https://")) return <a className="text-brand underline" href={text} target="_blank" rel="noreferrer">Rule details</a>
  if (text.startsWith("/api/evidence/")) return <a className="text-brand underline" href={API_URL + text} target="_blank" rel="noreferrer">View evidence</a>
  return <span className="break-words">{text}</span>
}

function Table({ title, rows }: { title: string; rows: RecordValue[] }) {
  if (!rows.length) return <Card title={title}><Empty what="Nothing recorded" why={`This run has no ${title.toLowerCase()} data.`} /></Card>
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 10)
  return <Card title={`${title} · ${rows.length}`} flush>
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12px]">
      <thead className="bg-white/35 text-muted-foreground"><tr>{columns.map((c) => <th key={c} className="p-3 font-semibold">{label(c)}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 100).map((r, i) => <tr key={i} className="border-t border-border align-top">{columns.map((c) => <td key={c} className="max-w-72 p-3"><Value value={r[c]} field={c} /></td>)}</tr>)}</tbody>
    </table></div>{rows.length > 100 && <p className="p-3 text-xs text-muted-foreground">Showing the first 100 records.</p>}
  </Card>
}

function Section({ name, value }: { name: string; value: unknown }) {
  if (Array.isArray(value)) return <Table title={label(name)} rows={value.map((v) => typeof v === "object" && v !== null ? v as RecordValue : { value: v })} />
  if (value && typeof value === "object") {
    const object = value as RecordValue
    return <Card title={label(name)}><div className="grid gap-2 text-[12px]">
      {Object.entries(object).map(([key, item]) => Array.isArray(item) && item.every((x) => typeof x === "object")
        ? <div key={key}><h3 className="mb-2 font-medium">{label(key)}</h3><Table title={label(key)} rows={item as RecordValue[]} /></div>
        : <div key={key} className="grid gap-2 border-b border-border/60 py-1 last:border-0 sm:grid-cols-[11rem_1fr]"><span className="text-muted-foreground">{label(key)}</span><Value value={item} /></div>)}
    </div></Card>
  }
  return <Card title={label(name)}><Value value={value} /></Card>
}

function Highlights({ kind, data }: { kind: string; data: RunViewData }) {
  if (kind === "ui") {
    const shots = (data.screenshots ?? []) as { id: string; case: string; url: string | null }[]
    return shots.length ? <Card title={`Screenshots · ${shots.length}`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{shots.slice(0, 12).map((shot) => shot.url && <a key={shot.id} href={API_URL + shot.url} target="_blank" rel="noreferrer" className="glass-inset overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={API_URL + shot.url} alt={`Screenshot for ${shot.case}`} className="aspect-video w-full object-cover object-top" />
        <span className="block p-2 font-mono text-[11px]">{shot.case}</span>
      </a>)}</div>
    </Card> : null
  }
  if (kind === "perf") {
    const rows = (data.slow_requests ?? []) as { method?: string; path?: string; ms?: number }[]
    const max = Math.max(1, ...rows.map((r) => r.ms ?? 0))
    return rows.length ? <Card title="Slowest requests · measured response time">
      <div className="grid gap-2">{rows.slice(0, 12).map((row, i) => <div key={i} className="grid grid-cols-[minmax(0,12rem)_1fr_4rem] items-center gap-2 font-mono text-[11px]">
        <span className="truncate" title={`${row.method ?? "GET"} ${row.path ?? ""}`}>{row.method ?? "GET"} {row.path ?? ""}</span>
        <span className="h-2 rounded-full bg-white/45"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, 100 * (row.ms ?? 0) / max)}%` }} /></span>
        <span className="text-right">{row.ms ?? "?"} ms</span>
      </div>)}</div>
    </Card> : null
  }
  if (kind === "security") {
    const summary = data.summary as { rules?: Record<string, string> } | null
    const rules = Object.entries(summary?.rules ?? {})
    const passed = rules.filter(([, result]) => result === "passed").length
    return rules.length ? <Card title={`Passive checks · ${passed}/${rules.length} passed`}>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">{rules.map(([rule, result]) => <div key={rule} className="glass-inset rounded-xl p-3 text-[12px]">
        <b className="font-mono">{rule}</b><span className={`ml-2 ${result === "failed" ? "text-bad" : result === "passed" ? "text-det" : "text-muted-foreground"}`}>{result}</span>
      </div>)}</div>
    </Card> : null
  }
  if (kind === "environment") {
    const environment = data.environment as { browser?: string; version?: string; os?: string; os_version?: string; viewport?: { width?: number; height?: number } } | null
    return <Card title="Browser matrix">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="glass-inset rounded-xl p-3 text-[12px]"><b>{environment?.browser ?? "Browser not recorded"}</b><p>{environment ? `${environment.version ?? "version unknown"} · ${environment.os ?? "OS unknown"} ${environment.os_version ?? ""}` : "Run a new browser test to record it."}</p><p>{environment?.viewport ? `${environment.viewport.width} × ${environment.viewport.height}` : "Viewport not recorded"}</p></div>
        {["Firefox", "WebKit", "iPhone 13"].map((browser) => <div key={browser} className="glass-inset rounded-xl p-3 text-[12px]"><b>{browser}</b><p className="text-muted-foreground">{(data.matrix as { browser: string }[] | undefined)?.some((row) => row.browser.toLowerCase() === browser.toLowerCase()) ? "See case matrix below" : "Not run"}</p></div>)}
      </div>
    </Card>
  }
  return null
}

export async function LiveRunResult({ kind }: { kind: keyof typeof TITLES }) {
  const title = TITLES[kind]
  const run = await scopedRun()
  if (!run) return <><PageHeader eyebrow="Live data" title={title} /><Card title="No run selected"><Empty what="No run yet" why="Start a run or choose a project with runs in the top bar." /></Card></>
  const encoded = encodeURIComponent(run)
  const [data, ...graphs] = await Promise.all([
    tryApi<RunViewData>(`/api/runs/${encoded}/${kind}`),
    ...(DIAGRAMS[kind] ?? []).map((name) => tryApi<Graph>(`/api/runs/${encoded}/diagrams/${name}`)),
  ])
  if (!data) return <PageLoading title={title} error="The run view could not be loaded. Check that the API is running." />
  const sections = Object.entries(data).filter(([key]) => !["run", "reason"].includes(key))
  return <div className="grid gap-3.5">
    <PageHeader eyebrow="Live run" title={title} sub={`${data.run.display_id} · ${data.run.name} · ${data.run.state}`} />
    {data.reason ? <p className="text-[12px] text-muted-foreground">{String(data.reason)}</p> : null}
    {graphs.map((graph, i) => graph?.nodes.length ? <Card key={i} title={`${label(DIAGRAMS[kind][i])} · ${data.run.display_id}`}>
      {/* the card grows with the diagram: FlowMap sizes itself from where its nodes actually are */}
      <div><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={label(DIAGRAMS[kind][i])} /></div>
    </Card> : null)}
    <Highlights kind={kind} data={data} />
    {sections.map(([key, value]) => <Section key={key} name={key} value={value} />)}
  </div>
}
