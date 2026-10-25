import { FlowMap } from "@/components/charts/flow-map"
import { PageHeader } from "@/components/kit/page-header"
import { Pill } from "@/components/kit/pills"
import { ScrollCard } from "./scroll-card"

type Endpoint = { method: string; path: string; requests: number; errors: number; p50_ms: number | null; p95_ms: number | null }
type Call = { case?: string; method?: string; path?: string; status?: number | null; ms?: number | null; resourceType?: string }
export type ApiRunData = { run: { display_id: string; name: string; state: string }; calls?: Call[]; endpoints?: Endpoint[]; contract_tests?: string; reason?: string | null }
export type ApiGraph = { nodes: { id: string; label: string; sub: string; k?: "ai" | "det" | "human" | "bad" | "warn" | "acc" | "mut"; x: number; y: number }[];
  edges: { from: string; to: string; k?: "mut" }[]; w: number; h: number }
const timing = (value: number | null | undefined) => value == null ? "Not recorded" : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`

export function ApiRunResult({ data, diagrams }: { data: ApiRunData; diagrams: { name: string; graph: ApiGraph | null }[] }) {
  const calls = data.calls ?? []
  const endpoints = data.endpoints ?? []
  const errors = endpoints.reduce((sum, endpoint) => sum + endpoint.errors, 0)
  return <div className="grid gap-3.5">
    <PageHeader title="API & integration" />
    <ScrollCard title="Result" size="summary">
      <p className="text-[21px] font-semibold tracking-tight">{calls.length ? `${calls.length} API calls captured across ${endpoints.length} paths` : "No same-site API calls captured"}</p>
      {calls.length > 0 && <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{errors} HTTP error response{errors === 1 ? "" : "s"} recorded.</p>}
      {data.contract_tests === "not run" && <p className="mt-3 text-[12px] text-muted-foreground">Contract tests were not run.</p>}
    </ScrollCard>

    {endpoints.length > 0 && <div className="grid gap-3.5 xl:grid-cols-2">
      <ScrollCard title={`API paths · ${endpoints.length}`} caption="p50 is the middle response; p95 is near the slow end">
        <div className="divide-y divide-border">{endpoints.map((endpoint) => <div key={`${endpoint.method}:${endpoint.path}`} className="py-2.5 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]"><b className="break-all">{endpoint.method} {endpoint.path}</b>{endpoint.errors > 0 && <Pill tone="bad">{endpoint.errors} HTTP errors</Pill>}</div>
          <p className="mt-1 text-[12px] text-muted-foreground">{endpoint.requests} request{endpoint.requests === 1 ? "" : "s"} · middle {timing(endpoint.p50_ms)} · p95 {timing(endpoint.p95_ms)}</p>
        </div>)}</div>
      </ScrollCard>

      <ScrollCard title={`Captured calls · ${calls.length}`}>
        <div className="divide-y divide-border">{calls.map((call, i) => <div key={`${call.case}:${call.method}:${call.path}:${i}`} className="py-2.5 first:pt-0 text-[12.5px]">
          <p className="break-all font-semibold">{call.method || "GET"} {call.path || "Unknown path"}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">{call.case || "Case unknown"} · {call.status == null ? "Status unavailable" : `HTTP ${call.status}`} · {timing(call.ms)}</p>
        </div>)}</div>
      </ScrollCard>
    </div>}

    {endpoints.length > 0 && diagrams.some(({ graph }) => graph?.nodes.length) && <section aria-label="API diagrams" className="grid gap-3.5">{diagrams.map(({ name, graph }) => graph?.nodes.length ? <ScrollCard key={name} title="API map" size="diagram"><FlowMap nodes={graph.nodes} edges={graph.edges} w={graph.w} h={graph.h} label={name} /></ScrollCard> : null)}</section>}
  </div>
}
