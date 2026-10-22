"use client"
// Projects (from Overview.jsx Projects): every application Trevyn is authorised to test.
import Link from "next/link"
import { motion } from "motion/react"
import { Plus } from "lucide-react"
import { Sparkline } from "@/components/charts/progress"
import { PageHeader } from "@/components/kit/page-header"
import { hue } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { DEMO_PROJECTS } from "@/lib/demo/core"
import { notify } from "@/lib/notify"

export function ProjectsView() {
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Projects" sub="Every application Trevyn is authorised to test, with its environments and current quality.">
        <Button variant="brand" size="pill" onClick={() => notify("Project created. Add its URL to the allowlist to start testing.")}><Plus />New project</Button>
      </PageHeader>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_PROJECTS.map((p, i) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
            <Link href={i === 0 ? "/" : "/projects"} onClick={() => i && notify(`${p.name} is a sample project in this demo`, "warn")} className="press glass-1 spot block rounded-[22px] p-4 transition-shadow hover:shadow-(--shadow-float)">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span style={{ "--h": hue(p.name) } as React.CSSProperties} className="grid size-9 place-items-center rounded-xl bg-[hsl(var(--h)_55%_90%)] font-semibold text-[hsl(var(--h)_50%_30%)]">{p.name[0]}</span>
                  <div><h3 className="text-[15px] font-semibold">{p.name}</h3><div className="text-[11.5px] text-muted-foreground">{p.desc}</div></div>
                </div>
                <span className="rounded-full bg-human/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wider text-human">{p.env.toUpperCase()}</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-[11.5px] text-muted-foreground">Pass rate</div><div className="text-[24px] font-light tabular">{p.pass}%</div></div>
                <Sparkline v={p.spark} color={p.pass > 90 ? "var(--ok)" : "var(--warn)"} />
              </div>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-[12.5px] text-muted-foreground"><span>{p.open} open findings</span><span className="font-mono">{p.run}</span></div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
