"use client"
// Shared filter bar for the findings list and board (from Board.jsx useFilter).
import { motion } from "motion/react"
import { Search } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { plainFinding } from "@/lib/findings/plain-language"
import { useLive } from "@/lib/live"
import type { Finding, FindingType } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPES: ["all" | FindingType, string][] = [["all", "All"], ["ui", "UI"], ["api", "API"], ["perf", "Perf"], ["security", "Security"], ["accessibility", "Accessibility"], ["compat", "Compat"]]

export function useFindingFilter(initialType?: string | null): [Finding[], React.ReactNode] {
  const findings = useLive((s) => s.findings)
  const [ty, setTy] = useState<"all" | FindingType>(TYPES.some(([k]) => k === initialType) ? (initialType as FindingType) : "all")
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const list = findings.filter((f) => {
    if (ty !== "all" && f.type !== ty) return false
    if (!query) return true
    const plain = plainFinding(f)
    return [f.title, f.id, plain.headline, plain.explanation, plain.location].join(" ").toLowerCase().includes(query)
  })
  const bar = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="glass-2 flex h-9 w-full max-w-64 items-center gap-2 rounded-full pl-3 text-muted-foreground">
        <Search size={15} />
        <Input className="h-full border-0 bg-transparent p-0 text-[13px] text-foreground shadow-none focus-visible:ring-0" placeholder="Search issues, pages, or IDs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search findings" />
      </label>
      <div className="glass-2 inline-flex rounded-full p-1" role="radiogroup" aria-label="Finding type">
        {TYPES.map(([k, l]) => (
          <button key={k} role="radio" aria-checked={ty === k} onClick={() => setTy(k)}
            className={cn("press relative rounded-full px-3 py-1 text-[12px] font-medium transition-colors", ty === k ? "text-white" : "text-muted-foreground hover:text-foreground")}>
            {ty === k && <motion.span layoutId="finding-type" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <span className="ml-auto text-[12.5px] text-muted-foreground tabular">{list.length} findings</span>
    </div>
  )
  return [list, bar]
}
