import { Suspense } from "react"
import { Card } from "@/components/kit/card"
import { PageHeader } from "@/components/kit/page-header"
import { PageLoading } from "@/components/kit/page-loading"
import { LiveRunResult } from "@/components/quality/run-result-view"
import { tryApi } from "@/lib/api"
import { Appearance } from "@/components/shell/appearance"

export function LivePolicies() {
  return <Suspense fallback={<PageLoading title="Policies" />}><LiveRunResult kind="policy" /></Suspense>
}

export function LiveSettings() {
  return <div className="grid gap-3.5">
    <Suspense fallback={<PageLoading title="Run usage" />}><LiveRunResult kind="usage" /></Suspense>
    <Card title="Appearance"><Appearance /></Card>
  </div>
}

async function Status() {
  const status = await tryApi<Record<string, boolean>>("/api/integrations")
  return <Card title="Workspace connections">
    {status ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(status).map(([name, enabled]) =>
      <div key={name} className="glass-inset rounded-xl p-3 text-[13px]"><b className="capitalize">{name}</b><p className="text-muted-foreground">{enabled ? "Configured" : "Not configured"}</p></div>)}</div>
      : <p role="alert" className="text-sm text-bad">Integration status could not be loaded.</p>}
  </Card>
}

export function LiveIntegrations() {
  return <div className="grid gap-3.5">
    <PageHeader title="Integrations" sub="Workspace connections and services used by the selected run." />
    <Suspense fallback={<PageLoading title="Integration status" />}><Status /></Suspense>
    <Suspense fallback={<PageLoading title="Run usage" />}><LiveRunResult kind="usage" /></Suspense>
  </div>
}
