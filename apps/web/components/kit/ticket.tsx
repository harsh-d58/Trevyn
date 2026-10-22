// Ticket details from rcharts.jsx: perforation with side notches and a deterministic barcode stub.
import { cn } from "@/lib/utils"

/** dashed rule with half-circle notches; the notch shows the wallpaper through the card edge */
export const Perforation = ({ className }: { className?: string }) => (
  <div className={cn("relative border-t border-dashed border-border", className)} aria-hidden="true">
    <span className="absolute -top-[7px] -left-[7px] size-3.5 rounded-full border border-border bg-background [clip-path:inset(0_0_0_50%)]" />
    <span className="absolute -top-[7px] -right-[7px] size-3.5 rounded-full border border-border bg-background [clip-path:inset(0_50%_0_0)]" />
  </div>
)

function barWidths(s: string, n: number) {
  let h = [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 5381)
  return Array.from({ length: n }, () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return (h % 3) + 1 })
}

export function Barcode({ s, n = 42, className }: { s: string; n?: number; className?: string }) {
  const bars = barWidths(s, n)
  return <div className={cn("flex h-8 items-stretch gap-[2px]", className)} aria-hidden="true">{bars.map((w, i) => <i key={i} className="bg-foreground/80" style={{ width: w }} />)}</div>
}
