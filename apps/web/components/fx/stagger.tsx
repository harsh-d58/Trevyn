"use client"
// Page entrance: children fade up 40ms apart, once per mount (GLASS_DESIGN_LANGUAGE.md C.17).
import { motion, type HTMLMotionProps } from "motion/react"

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
      {children}
    </motion.div>
  )
}

export function Item({ className, ...p }: HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} {...p}
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }} />
  )
}
