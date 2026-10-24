"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { Suspense } from "react"
import { SECTION_TABS } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** `layout` must be unique per mounted copy (the top bar and the page body can both render tabs) */
export function SectionTabs({ layout = "tab-active" }: { layout?: string }) {
  return <Suspense fallback={<Tabs path={null} layout={layout} />}><TabsWithPath layout={layout} /></Suspense>
}
function TabsWithPath({ layout }: { layout: string }) {
  return <Tabs path={usePathname()} layout={layout} />
}

function Tabs({ path, layout }: { path: string | null; layout: string }) {
  return (
    <nav aria-label="Sections" className="glass-2 inline-flex rounded-full p-1">
      {SECTION_TABS.map((t, i) => {
        const active = !!path && (t.href === "/" ? path === "/" : path.startsWith(t.href))
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} title={`Shift+${i + 1}`}
            className={cn("press relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", active ? "text-white" : "text-muted-foreground hover:text-foreground")}>
            {active && <motion.span layoutId={layout} className="absolute inset-0 rounded-full bg-ink shadow-[0_6px_16px_-8px_rgb(11_26_61/.7)]"
              transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
            <span className="relative">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
