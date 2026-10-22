"use client"
// Appearance quick panel (GLASS_DESIGN_LANGUAGE.md C.16): wallpaper, accent and glass, applied live.
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { ACCENTS, GLASS, WALLPAPERS, setPref, usePrefs } from "@/lib/prefs"
import { cn } from "@/lib/utils"

const THUMB: Record<(typeof WALLPAPERS)[number], string> = {
  prism: "radial-gradient(60% 70% at 10% 10%,#c9c1ff,transparent 70%),radial-gradient(60% 70% at 95% 5%,#c3d8ff,transparent 70%),radial-gradient(60% 70% at 5% 95%,#bfede2,transparent 70%),radial-gradient(60% 70% at 95% 95%,#ffe0c4,transparent 70%),#eef2fa",
  mist: "radial-gradient(60% 70% at 15% 15%,#d5deee,transparent 70%),radial-gradient(60% 70% at 90% 90%,#d9e3f0,transparent 70%),#eef1f6",
  sage: "radial-gradient(60% 70% at 15% 15%,#cfe8d8,transparent 70%),radial-gradient(60% 70% at 90% 90%,#e8f1d9,transparent 70%),#eef4ef",
  dawn: "radial-gradient(60% 70% at 15% 15%,#ffd9c9,transparent 70%),radial-gradient(60% 70% at 90% 20%,#e9d6ff,transparent 70%),radial-gradient(60% 70% at 50% 100%,#ffe9c9,transparent 70%),#f6f1f2",
  solid: "#f4f6fa",
}

export function Appearance() {
  const prefs = usePrefs()
  return (
    <div className="grid gap-4 p-1">
      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Wallpaper</h4>
        <div className="grid grid-cols-5 gap-2">
          {WALLPAPERS.map((w) => (
            <button key={w} onClick={() => setPref("wall", w)} aria-pressed={prefs.wall === w} className="press group grid gap-1 text-center">
              <span className={cn("relative block aspect-[4/3] rounded-xl ring-1 ring-black/5 transition", prefs.wall === w ? "ring-2 ring-brand ring-offset-2 ring-offset-white/60" : "group-hover:ring-black/15")}
                style={{ background: THUMB[w] }}>
                <span className="absolute inset-x-1.5 top-1.5 h-1.5 rounded-full bg-white/70" />
                <span className="absolute bottom-1.5 left-1.5 h-3 w-4 rounded-md bg-white/70" />
                {prefs.wall === w && (
                  <motion.span layoutId="wall-check" className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-brand text-white ring-2 ring-white">
                    <Check size={10} strokeWidth={3} />
                  </motion.span>
                )}
              </span>
              <span className="text-[11px] capitalize text-muted-foreground">{w}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Accent</h4>
        <div className="flex gap-2.5">
          {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((a) => (
            <button key={a} onClick={() => setPref("accent", a)} aria-label={`${a} accent`} aria-pressed={prefs.accent === a}
              className="press press-icon grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-white/60 transition hover:scale-110"
              style={{ background: ACCENTS[a], boxShadow: prefs.accent === a ? `0 0 0 2px #fff, 0 0 0 4px ${ACCENTS[a]}` : undefined }}>
              {prefs.accent === a && <Check size={13} strokeWidth={3} className="text-white" />}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Glass</h4>
        <div className="glass-inset relative grid grid-cols-3 rounded-full p-1">
          {GLASS.map((g) => (
            <button key={g} onClick={() => setPref("glass", g)} aria-pressed={prefs.glass === g}
              className={cn("relative rounded-full py-1.5 text-[12px] font-medium capitalize transition-colors", prefs.glass === g ? "text-white" : "text-muted-foreground hover:text-foreground")}>
              {prefs.glass === g && <motion.span layoutId="glass-seg" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className="relative">{g === "solid" ? "Solid" : g}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">Solid turns off transparency and blur everywhere.</p>
      </section>
    </div>
  )
}
