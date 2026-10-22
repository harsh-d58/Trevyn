"use client"
// Glass modal used for challenge / request-changes flows (replaces the prototype's fixed overlays).
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function GlassDialog({ open, onOpenChange, title, description, children, actions }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children?: React.ReactNode; actions: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-2 gap-3 rounded-3xl bg-[var(--g2)] p-4 ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
          {description && <DialogDescription className="text-[13px] text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="mt-1 flex justify-end gap-2">{actions}</div>
      </DialogContent>
    </Dialog>
  )
}
