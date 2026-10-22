// Surfaces: the glass Card (prototype Panel) and the dark StagePanel used for network maps
// (PORTING_PLAN.md D1: at most one StagePanel per page).
import { cn } from "@/lib/utils"

export function Card({ title, caption, extra, className, children, lift, flush, id }: {
  title?: React.ReactNode; caption?: React.ReactNode; extra?: React.ReactNode; className?: string; children: React.ReactNode
  lift?: boolean; /** body runs edge to edge (tables, tab strips) */ flush?: boolean; id?: string
}) {
  return (
    <section id={id} className={cn("glass-1 spot flex min-w-0 flex-col rounded-[22px] transition-[box-shadow,transform] duration-200 hover:shadow-(--shadow-float)",
      !flush && "p-4", lift && "hover:-translate-y-0.5", className)}>
      {(title || extra) && (
        <header className={cn("flex items-start justify-between gap-3", flush ? "px-4 pt-4 pb-3" : "mb-3")}>
          <div className="min-w-0">
            {title && <h3 className="text-[13.5px] font-semibold tracking-[-.005em]">{title}</h3>}
            {caption && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{caption}</p>}
          </div>
          {extra && <div className="shrink-0">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export type StageLegend = [color: string, label: string][]
/** Feature panel for network maps: the pastel lavender → pink → light-yellow surface (was dark navy in the prototype) */
export function StagePanel({ eyebrow, title, legend, aside, footer, children, className }: {
  eyebrow: string; title: React.ReactNode; legend?: StageLegend; aside?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(120deg,#f1ecff_0%,#fdeaf4_52%,#fff6dd_100%)] shadow-(--shadow-card)", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[.14em] text-[#8b7fb8] uppercase">{eyebrow}</div>
          <h2 className="mt-0.5 text-[17px] font-semibold text-navy">{title}</h2>
          {legend && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {legend.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}
            </div>
          )}
        </div>
        {aside}
      </div>
      <div className="px-3">{children}</div>
      {footer}
    </section>
  )
}

/** footer strip for a StagePanel: hairline-divided mono readouts */
export const StageStats = ({ items }: { items: [string, React.ReactNode][] }) => (
  <div className="grid grid-cols-2 border-t border-white/70 bg-white/40 md:grid-cols-4">
    {items.map(([l, v]) => (
      <div key={l} className="px-4 py-2">
        <div className="font-mono text-[9.5px] tracking-[.14em] text-[#8b7fb8] uppercase">{l}</div>
        <div className="truncate font-mono text-[11.5px] tabular">{v}</div>
      </div>
    ))}
  </div>
)
