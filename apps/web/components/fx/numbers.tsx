"use client"
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

const fmt = (n: number, decimals: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** Counts up from 0 when scrolled into view, then tweens between later values. */
export function CountUp({ value, decimals = 0, suffix = "", className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const from = useRef(0)

  useEffect(() => {
    const node = ref.current
    if (!node || !inView) return
    if (reduce) { node.textContent = fmt(value, decimals) + suffix; return }
    const controls = animate(from.current, value, {
      duration: 0.7, ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { node.textContent = fmt(v, decimals) + suffix },
    })
    from.current = value
    return () => controls.stop()
  }, [value, decimals, suffix, inView, reduce])

  return <span ref={ref} className={className}>{fmt(0, decimals) + suffix}</span>
}

/** Odometer: each changed digit slides in vertically (used for live counters). */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [prev, setPrev] = useState(value)
  const [dir, setDir] = useState(1)
  if (value !== prev) { setDir(value > prev ? 1 : -1); setPrev(value) }
  return (
    <span className={`inline-flex overflow-hidden ${className ?? ""}`} aria-label={String(value)}>
      {String(value).split("").map((ch, i, all) => (
        <span key={all.length - i} className="relative inline-block" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.span key={ch} className="inline-block"
              initial={{ y: `${dir * 100}%`, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: `${-dir * 100}%`, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}>{ch}</motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
