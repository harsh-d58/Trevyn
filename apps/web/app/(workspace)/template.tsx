"use client"
// Route change: content blurs in while the rail, island and cluster stay mounted (GLASS_DESIGN_LANGUAGE.md C.17)
import { motion } from "motion/react"

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}
