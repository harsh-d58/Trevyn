// Fails on trevyn-app tokens that compile but render wrong in the glass theme (PORTING_PLAN.md §3.2, §8.2).
import { globSync, readFileSync } from "node:fs"

const RULES = [
  [/\btext-muted(?!-foreground)\b/, "text-muted-foreground"],
  [/\b(bg|text|border|ring|fill|stroke)-accent\b/, "*-brand (shadcn's accent is a 10% hover wash)"],
  [/\bbg-surface2?\b|\bborder-line\b|\btext-fg\b|\bbg-fg\b|\btext-bg\b|\bbg-bg\b/, "see PORTING_PLAN §3.2"],
  [/(?<![-\w])shadow-(card|lift)\b/, "glass-1 / hover:shadow-(--shadow-float)"], // not the --shadow-card variable
  [/var\(--(surface2?|line|fg|accent)\)/, "var(--border | --foreground | --brand) or a literal"],
  [/var\(--muted\)/, "var(--muted-foreground)"],
  [/className="[^"]*\b(inp|th|td|lab-grid|anim-in)\b/, "shadcn Input / kit DataTable / motion"],
]

let bad = 0
for (const f of globSync("{app,components,lib}/**/*.{ts,tsx}", { exclude: ["components/ui/**"] })) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const [re, fix] of RULES) {
      if (re.test(line)) { bad++; console.error(`${f}:${i + 1}  ${line.trim().slice(0, 100)}\n   → ${fix}`) }
    }
  })
}
if (bad) { console.error(`\n${bad} legacy token(s). See PORTING_PLAN.md §3.2`); process.exit(1) }
console.log("check:legacy ok")
