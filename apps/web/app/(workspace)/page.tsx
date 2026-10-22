import type { Metadata } from "next"
import { Item, Stagger } from "@/components/fx/stagger"
import { ActiveRuns } from "@/components/dashboard/active-runs"
import { CategoryPolar } from "@/components/dashboard/category-polar"
import { FailingSuites } from "@/components/dashboard/failing-suites"
import { Greeting, StatPills } from "@/components/dashboard/greeting"
import { HeroReadiness } from "@/components/dashboard/hero-readiness"
import { KpiRow } from "@/components/dashboard/kpi-row"
import { LoopRings } from "@/components/dashboard/loop-rings"
import { LoopStrip, PlatformPipeline } from "@/components/dashboard/platform-live"
import { ReviewQueue } from "@/components/dashboard/review-queue"
import { RunHealth } from "@/components/dashboard/run-health"
import { Throughput } from "@/components/dashboard/throughput"
import { WeekSlots } from "@/components/dashboard/week-slots"
import { SectionTabs } from "@/components/shell/section-tabs"
import { getDashboardSummary } from "@/lib/data"

export const metadata: Metadata = { title: "Overview" }

export default async function Overview() {
  const s = await getDashboardSummary()
  return (
    <Stagger className="grid gap-3.5">
      <Item><Greeting /></Item>
      <Item className="flex flex-wrap items-center justify-between gap-3"><SectionTabs /><StatPills /></Item>
      <Item><KpiRow kpis={s.kpis} /></Item>
      <div className="grid gap-3.5 lg:grid-cols-2 xl:grid-cols-12">
        <Item className="lg:col-span-2 xl:col-span-5"><HeroReadiness gate={s.gate} /></Item>
        <Item className="xl:col-span-3"><LoopRings /></Item>
        <Item className="xl:col-span-4"><ReviewQueue /></Item>
      </div>
      <Item><PlatformPipeline /></Item>
      <Item><LoopStrip /></Item>
      <div className="grid gap-3.5 xl:grid-cols-12">
        <Item className="xl:col-span-7"><RunHealth data={s.runHealth} /></Item>
        <Item className="xl:col-span-5"><CategoryPolar data={s.categories} /></Item>
      </div>
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <Item><FailingSuites data={s.topSuites} /></Item>
        <Item><Throughput data={s.throughput} /></Item>
        <Item className="md:col-span-2 xl:col-span-1"><WeekSlots data={s.week} /></Item>
      </div>
      <Item className="mt-2"><ActiveRuns /></Item>
    </Stagger>
  )
}
