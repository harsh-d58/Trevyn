"use client"
// One delegated listener pair for the whole app (GLASS_DESIGN_LANGUAGE.md C.14, E.2):
// - pointermove writes --mx/--my on the hovered .spot (cursor spotlight + edge light), rAF-throttled, no React renders
// - pointerdown drops a .pulse-dot at the click point inside the nearest .pulse element
import { useEffect } from "react"

export function FxProvider() {
  useEffect(() => {
    let frame = 0
    let last: PointerEvent | null = null
    const move = (e: PointerEvent) => {
      last = e
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = (last?.target as Element | null)?.closest?.<HTMLElement>(".spot")
        // skip server HTML React hasn't hydrated yet (streamed under Suspense), or hydration sees an inline style it didn't render
        if (!el || !last || !Object.keys(el).some((k) => k.startsWith("__reactFiber"))) return
        const r = el.getBoundingClientRect()
        el.style.setProperty("--mx", `${last.clientX - r.left}px`)
        el.style.setProperty("--my", `${last.clientY - r.top}px`)
      })
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".pulse")
      if (!el) return
      const r = el.getBoundingClientRect()
      const dot = document.createElement("span")
      dot.className = "pulse-dot"
      dot.style.left = `${e.clientX - r.left}px`
      dot.style.top = `${e.clientY - r.top}px`
      dot.addEventListener("animationend", () => dot.remove(), { once: true })
      el.appendChild(dot)
    }
    document.addEventListener("pointermove", move, { passive: true })
    document.addEventListener("pointerdown", down, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerdown", down)
    }
  }, [])
  return null
}
