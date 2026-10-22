// Page header (prototype PageHead): eyebrow, title, subtitle, actions on the right.
import { cn } from "@/lib/utils"

export function PageHeader({ eyebrow, title, sub, children, className }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold tracking-widest text-brand uppercase">{eyebrow}</div>}
        <h1 className="text-[28px] font-medium tracking-[-.02em] text-balance text-navy sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-1 max-w-[70ch] text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
