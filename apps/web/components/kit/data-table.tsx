// DataTable: the prototype's Table (.th/.td) on shadcn's table, styled for glass.
// Put it inside <Card flush>. Clickable rows: pass onClick to <Row> and make the first cell a Link
// so the row is reachable by keyboard.
import { cn } from "@/lib/utils"

export function DataTable({ head, children, className, minWidth }: { head: React.ReactNode[]; children: React.ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-y border-border bg-white/35 px-4 py-2.5 text-left font-mono text-[10.5px] font-medium tracking-[.12em] whitespace-nowrap text-muted-foreground uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-0">{children}</tbody>
      </table>
    </div>
  )
}

export function Row({ children, onClick, className, highlight }: { children: React.ReactNode; onClick?: () => void; className?: string; highlight?: boolean }) {
  return (
    <tr onClick={onClick} className={cn("transition-colors hover:bg-white/60", onClick && "cursor-pointer", highlight && "bg-brand/6", className)}>
      {children}
    </tr>
  )
}

export function Cell({ children, className, ...p }: React.ComponentProps<"td">) {
  return <td {...p} className={cn("border-b border-border px-4 py-2.5 align-middle", className)}>{children}</td>
}
