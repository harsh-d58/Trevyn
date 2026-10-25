import { Card } from "@/components/kit/card"
import { cn } from "@/lib/utils"

export function ScrollCard({ title, caption, children, size = "regular", className }: {
  title: string; caption?: string; children: React.ReactNode; size?: "summary" | "regular" | "diagram"; className?: string
}) {
  return <Card title={title} caption={caption} className={cn(size === "summary" ? "h-[210px]" : size === "diagram" ? "h-[440px]" : "h-[360px]", className)}>
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1" role="region" aria-label={`${title} content`} tabIndex={0}>{children}</div>
  </Card>
}
