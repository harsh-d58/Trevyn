"use client"
// Top chrome: workspace pill (left), dynamic island (centre, fixed), floating action cluster (right).
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Check, ChevronDown, CirclePlay, FlaskConical, FolderKanban, ListChecks, Menu, Palette, Plus, Repeat, Search } from "lucide-react"
import { useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { NOTIFICATIONS } from "@/lib/data"
import { DEMO_PROJECTS } from "@/lib/demo/core"
import { notify } from "@/lib/notify"
import { RAIL_MAIN, RAIL_UTILITY, isGroup } from "@/lib/nav"
import { Appearance } from "./appearance"
import { Island } from "./island"
import { SectionTabs } from "./section-tabs"
import { Wordmark } from "./wordmark"
import { UserMenu } from "./user-menu"
import { Tag } from "@/components/dashboard/bits"

const iconBtn = "press press-icon pulse grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/80 hover:text-foreground"

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const [unread, setUnread] = useState(true)
  const [notif, setNotif] = useState(false)
  const [menu, setMenu] = useState(false)
  const home = usePathname() === "/"
  return (
    <>
      <header className="sticky top-3 z-30 flex h-[52px] items-start justify-between gap-3">
        <div className="flex gap-2">
        <button onClick={() => setMenu(true)} aria-label="Open navigation" className="press glass-2 grid size-11 place-items-center rounded-full md:hidden"><Menu size={18} /></button>
        <Wordmark className="hidden md:flex" />
        {home && <div className="hidden md:block"><SectionTabs layout="tab-active-top" /></div>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<button className={`press glass-2 h-11 items-center gap-2 rounded-full pr-3 pl-1.5 text-[13px] font-medium ${home ? "flex md:hidden" : "flex"}`} />}>
            <span className="grid size-8 place-items-center rounded-full bg-[hsl(222_80%_94%)] text-[12px] font-bold text-brand">S</span>
            <span className="hidden sm:inline">ShopFlow Commerce</span>
            <span className="rounded-full bg-human/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-human"><span className="hidden sm:inline">STAGING · </span>DEMO</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={10} className="glass-2 w-72 rounded-2xl bg-[var(--g2)] p-1.5 ring-0">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              {DEMO_PROJECTS.map((p, i) => (
                <DropdownMenuItem key={p.name} onClick={() => i && notify(`${p.name} is a sample project in this demo`, "warn")}>
                  <span className="grid size-6 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">{p.name[0]}</span>
                  <span className="flex-1">{p.name}</span>
                  {i === 0 ? <Check className="text-brand" /> : <span className="text-[11px] text-muted-foreground tabular">{p.pass}%</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/projects" />}><FolderKanban />All projects</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>

        <Island />

        <div className="glass-2 flex h-11 items-center gap-0.5 rounded-full px-1">
          <button onClick={onSearch} className="press pulse hidden h-9 items-center gap-2 rounded-full pr-1.5 pl-3 text-[13px] text-muted-foreground hover:bg-white/80 lg:flex">
            <Search size={15} />Search
            <kbd className="rounded-md border border-border bg-white/80 px-1.5 font-mono text-[10.5px]">Ctrl K</kbd>
          </button>
          <button onClick={onSearch} aria-label="Search" className={`${iconBtn} lg:hidden`}><Search size={17} /></button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="New" className={iconBtn} />}><Plus size={18} /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="glass-2 w-56 rounded-2xl bg-[var(--g2)] p-1.5 ring-0">
              <DropdownMenuItem render={<Link href="/runs/new" />}><FlaskConical />Smoke run</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/regression" />}><Repeat />Full regression</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/plans" />}><ListChecks />From test plan…</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/runs" />}><CirclePlay />Watch live run</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger render={<button aria-label="Appearance" className={iconBtn} />}><Palette size={17} /></PopoverTrigger>
            <PopoverContent align="end" sideOffset={10} className="glass-2 w-80 rounded-3xl bg-[var(--g2)] p-3 ring-0">
              <Appearance />
            </PopoverContent>
          </Popover>
          <button aria-label="Notifications" onClick={() => { setNotif(true); setUnread(false) }} className={`${iconBtn} relative`}>
            <Bell size={17} />
            {unread && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-bad ring-2 ring-white" />}
          </button>
          <span className="ml-0.5 hidden sm:block"><UserMenu /></span>
        </div>
      </header>

      {/* below md the rail is hidden; the same destinations open in a glass sheet */}
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="glass-2 m-3 h-[calc(100%-24px)] w-[calc(100%-24px)] overflow-y-auto rounded-3xl border-0 bg-[var(--g2)]">
          <SheetHeader><SheetTitle className="font-display text-[22px] tracking-[.06em] text-navy">TREVYN</SheetTitle></SheetHeader>
          <nav aria-label="Main" className="grid gap-4 px-3 pb-4">
            {[{ label: "Workspace", items: RAIL_MAIN.filter((x) => !isGroup(x)) }, ...RAIL_MAIN.filter(isGroup), { label: "Administration", items: RAIL_UTILITY }].map((g) => (
              <div key={g.label}>
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{g.label}</div>
                {g.items.map((i) => !isGroup(i) && (
                  <Link key={i.href} href={i.href} onClick={() => setMenu(false)} className="press pulse flex items-center gap-3 rounded-2xl px-2 py-2 text-[14px] hover:bg-white/80">
                    <i.icon size={17} className="text-muted-foreground" />{i.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <Sheet open={notif} onOpenChange={setNotif}>
        <SheetContent className="glass-2 m-3 h-[calc(100%-24px)] rounded-3xl border-0 bg-[var(--g2)]">
          <SheetHeader><SheetTitle>Notifications</SheetTitle></SheetHeader>
          <div className="grid gap-1 px-2">
            {NOTIFICATIONS.map((n) => (
              <div key={n.text} className="flex gap-3 rounded-2xl px-2 py-2.5 hover:bg-white/70">
                <Tag k={n.kind} />
                <div><div className="text-[13px]">{n.text}</div><div className="text-xs text-muted-foreground">{n.when}</div></div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
