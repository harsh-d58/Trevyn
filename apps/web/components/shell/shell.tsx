"use client"
// Workspace chrome + global keyboard: Ctrl/⌘K opens search, Shift+1..4 switches section tabs
// (with a navigation toast), and a first-sessions hint pill teaches both.
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Command, X } from "lucide-react"
import { Suspense, useEffect, useState } from "react"
import { toast } from "sonner"
import { SECTION_TABS } from "@/lib/nav"
import { CommandMenu } from "./command-menu"
import { Rail } from "./rail"
import { TopBar } from "./top-bar"
import { Wallpaper } from "./wallpaper"

const HINT_KEY = "trevyn.hint.dismissed"

function ShortcutPill() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(HINT_KEY) === "1" } catch {}
    const t = setTimeout(() => setShow(!dismissed), 1200)
    return () => clearTimeout(t)
  }, [])
  const dismiss = () => { setShow(false); try { localStorage.setItem(HINT_KEY, "1") } catch {} }
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className="island fixed right-4 bottom-4 z-40 hidden items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3.5 text-[12px] md:flex">
          <Command size={13} className="text-white/60" />
          <span><b className="font-semibold">Shift 1–4</b> switch views · <b className="font-semibold">Ctrl K</b> search</span>
          <button onClick={dismiss} aria-label="Dismiss hint" className="press grid size-6 place-items-center rounded-full hover:bg-white/15"><X size={13} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Keyboard({ setSearch }: { setSearch: React.Dispatch<React.SetStateAction<boolean>> }) {
  const router = useRouter()
  const path = usePathname()
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); return }
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]")
      const n = Number(e.code.replace("Digit", ""))
      if (e.shiftKey && !typing && n >= 1 && n <= SECTION_TABS.length) {
        const tab = SECTION_TABS[n - 1]
        if (tab.href === path) return
        router.push(tab.href)
        toast(`Navigated to ${tab.label}`, { duration: 1600 })
      }
    }
    addEventListener("keydown", key)
    return () => removeEventListener("keydown", key)
  }, [router, path, setSearch])
  return null
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState(false)
  return (
    <>
      <Wallpaper />
      <Rail />
      <div className="min-h-dvh px-3 pb-16 md:pl-[84px] lg:pr-5">
        <TopBar onSearch={() => setSearch(true)} />
        <main className="mx-auto mt-5 max-w-[1440px]">{children}</main>
      </div>
      <CommandMenu open={search} onOpenChange={setSearch} />
      <ShortcutPill />
      <Suspense fallback={null}><Keyboard setSearch={setSearch} /></Suspense>
    </>
  )
}
