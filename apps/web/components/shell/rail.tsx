"use client"
// Floating rail (GLASS_DESIGN_LANGUAGE.md C.2/C.3): three detached glass capsules. The ink indicator slides
// between items with a shared layoutId and stretches like liquid on the way. Groups open a flyout sheet.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { Check, ChevronRight } from "lucide-react"
import { Suspense, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RAIL_MAIN, RAIL_UTILITY, activeHref, isGroup, type NavGroup, type NavItem } from "@/lib/nav"
import { useLive } from "@/lib/live"
import { cn } from "@/lib/utils"

const HREFS = [...RAIL_MAIN.flatMap((x) => (isGroup(x) ? x.items : [x])), ...RAIL_UTILITY].map((x) => x.href)

function Indicator() {
  return (
    <motion.span layoutId="rail-active" className="absolute inset-0 rounded-full bg-ink shadow-[0_6px_16px_-6px_rgb(11_26_61/.6)]"
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      animate={{ scaleY: [1.22, 1] }} />
  )
}

/** Glass title that slides out beside a rail icon on hover / keyboard focus. Pure CSS (no JS per hover);
 *  a short enter delay stops it flickering while the pointer travels down the rail. */
function HoverLabel({ label, hint, accent }: { label: string; hint?: string; accent?: string }) {
  return (
    <span aria-hidden className={cn(
      "pointer-events-none absolute top-1/2 left-full z-50 ml-3.5 flex -translate-x-1.5 -translate-y-1/2 scale-95 items-center gap-2 whitespace-nowrap opacity-0 blur-[2px]",
      "transition-[opacity,transform,filter] duration-150 ease-(--ease-out-soft)",
      "group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-none group-hover:delay-75 group-hover:duration-200",
      "group-focus-visible:translate-x-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:blur-none",
      "group-aria-expanded:hidden")}>
      {/* notch pointing back at the icon */}
      <i className="absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] border-b border-l border-white bg-white/95" />
      <span className="relative flex items-center gap-2 rounded-full border border-white bg-white/95 py-1.5 pr-3 pl-2 shadow-[0_10px_28px_-12px_rgb(15_37_87/.45)] backdrop-blur-xl">
        <i className="size-2 shrink-0 rounded-full" style={{ background: accent ?? "linear-gradient(135deg,var(--brand),var(--ai))" }} />
        <span className="text-[12.5px] font-semibold text-foreground">{label}</span>
        {hint && <span className="rounded-full bg-black/5 px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">{hint}</span>}
      </span>
    </span>
  )
}

function RailButton({ active, label, hint, children, badge }: { active: boolean; label: string; hint?: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <span className="relative block">
      <span className={cn("press press-icon pulse relative grid size-10 place-items-center rounded-full transition-colors",
        active ? "text-white" : "text-muted-foreground group-hover:bg-white/70 group-hover:text-foreground")}>
        {active && <Indicator />}
        <span className="relative transition-transform group-hover:translate-x-px">{children}</span>
        <span className="sr-only">{label}</span>
      </span>
      {badge}
      <HoverLabel label={label} hint={hint ?? (active ? "Current page" : undefined)} accent={active ? "var(--brand)" : undefined} />
    </span>
  )
}

function RailLink({ item, badge, current, hint }: { item: NavItem; badge?: React.ReactNode; current: string | null; hint?: string }) {
  const active = current === item.href
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className="group rounded-full outline-none">
      <RailButton active={active} label={item.label} hint={hint} badge={badge}><item.icon size={18} /></RailButton>
    </Link>
  )
}

function RailGroup({ group, current }: { group: NavGroup; current: string | null }) {
  const [open, setOpen] = useState(false)
  const active = group.items.some((i) => i.href === current)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button aria-label={group.label} className="group rounded-full outline-none" />}>
        <RailButton active={active} label={group.label} hint={`${group.items.length} pages ›`}><group.icon size={18} /></RailButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={14}
        className="glass-2 w-64 gap-0 rounded-3xl bg-[var(--g2)] p-2 ring-0 data-open:zoom-in-[.96]">
        <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.label}</div>
        {group.items.map((item, i) => (
          <motion.div key={item.href} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}>
            <Link href={item.href} onClick={() => setOpen(false)}
              className="press pulse group/item flex items-center gap-3 rounded-2xl px-2 py-1.5 text-[13.5px] hover:bg-white/80">
              <span className="grid size-7 place-items-center rounded-[9px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/.35)]" style={{ background: item.tint }}>
                <item.icon size={15} />
              </span>
              <span className={cn("flex-1", current === item.href && "font-semibold")}>{item.label}</span>
              {current === item.href
                ? <Check size={15} className="text-brand" />
                : <ChevronRight size={15} className="-translate-x-1 text-muted-foreground opacity-0 transition group-hover/item:translate-x-0 group-hover/item:opacity-100" />}
            </Link>
          </motion.div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// usePathname suspends on routes with unknown params (cacheComponents), so the rail prerenders without
// an active item and streams the highlighted version in.
export function Rail() {
  return <Suspense fallback={<RailView path={null} />}><RailWithPath /></Suspense>
}
function RailWithPath() {
  return <RailView path={usePathname()} />
}

function RailView({ path }: { path: string | null }) {
  const pending = useLive((s) => s.approvals.length)
  const current = activeHref(path, HREFS)
  return (
    <nav aria-label="Main" className="fixed top-3 bottom-3 left-3 z-40 hidden w-14 flex-col items-center gap-2.5 md:flex">
      <Link href="/" aria-label="Trevyn home" className="group press glass-2 relative grid size-14 place-items-center rounded-full outline-none">
        <span className="grid size-9 place-items-center rounded-[11px] bg-[linear-gradient(135deg,var(--brand),var(--ai)_45%,var(--det)_80%,var(--human))] font-display text-[19px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/.4)]">T</span>
      <HoverLabel label="Trevyn" hint="Home" />
      </Link>
      <div className="glass-2 flex flex-col items-center gap-1 rounded-full p-2">
        {RAIL_MAIN.map((x) => isGroup(x)
          ? <RailGroup key={x.label} group={x} current={current} />
          : <RailLink key={x.href} item={x} current={current} hint={x.href === "/approvals" && pending ? `${pending} waiting` : undefined} badge={x.href === "/approvals" && pending > 0
            ? <motion.span key={pending} initial={{ scale: 0.4 }} animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-human px-1 text-[10px] font-bold text-white ring-2 ring-white">{pending}</motion.span>
            : undefined} />)}
      </div>
      <div className="glass-2 mt-auto flex flex-col items-center gap-1 rounded-full p-2">
        {RAIL_UTILITY.map((x) => <RailLink key={x.href} item={x} current={current} />)}
        <span tabIndex={0} className="group relative mt-1 rounded-full outline-none">
          <span className="grid size-9 place-items-center rounded-full bg-[hsl(222_70%_90%)] text-[11px] font-semibold text-[hsl(222_60%_32%)] ring-2 ring-white">AC</span>
          <HoverLabel label="Alex Chen" hint="QA engineer" accent="hsl(222 70% 60%)" />
        </span>
      </div>
    </nav>
  )
}
