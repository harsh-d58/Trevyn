"use client"
// Prism wallpaper (GLASS_DESIGN_LANGUAGE.md B.2): one painted gradient layer that drifts slowly and
// parallaxes a few px toward the pointer, plus a 3% grain overlay so the frost reads as a material.
import { motion, useReducedMotion, useSpring } from "motion/react"
import { useEffect } from "react"

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Wallpaper() {
  const reduce = useReducedMotion()
  const x = useSpring(0, { stiffness: 40, damping: 20 })
  const y = useSpring(0, { stiffness: 40, damping: 20 })

  useEffect(() => {
    if (reduce) return
    const move = (e: PointerEvent) => {
      x.set((e.clientX / innerWidth - 0.5) * -16)
      y.set((e.clientY / innerHeight - 0.5) * -16)
    }
    addEventListener("pointermove", move, { passive: true })
    return () => removeEventListener("pointermove", move)
  }, [reduce, x, y])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <motion.div style={{ x, y }} className="absolute -inset-10">
        <div className="wallpaper absolute inset-0 will-change-transform [animation:drift_40s_ease-in-out_infinite_alternate]" />
      </motion.div>
      <div className="absolute inset-0 opacity-[.035] mix-blend-multiply" style={{ backgroundImage: GRAIN }} />
    </div>
  )
}
