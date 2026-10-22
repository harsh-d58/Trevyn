"use client"
import { useRouter } from "next/navigation"
import { Bug, CirclePlay, Inbox, Plus } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { ALL_PAGES } from "@/lib/nav"
import { useLive, useLiveStore } from "@/lib/live"

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const store = useLiveStore()
  const findings = useLive((s) => s.findings)
  const gate = useLive((s) => s.run?.state === "gate")
  const go = (href: string) => { onOpenChange(false); router.push(href) }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Trevyn" description="Jump to a page, finding or action"
      className="glass-2 max-w-xl! rounded-3xl! bg-[var(--g2)] ring-0">
      <Command className="bg-transparent">
      <CommandInput placeholder="Search pages, findings, actions…" />
      <CommandList className="max-h-[52vh] p-1">
        <CommandEmpty>No matches. Try a page name or a finding ID.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/runs/new")}><Plus />New test run</CommandItem>
          <CommandItem onSelect={() => go("/runs/live")}><CirclePlay />Watch live run</CommandItem>
          {gate && <CommandItem onSelect={() => { onOpenChange(false); store.approveGate() }}><Inbox />Approve the waiting high-impact tests</CommandItem>}
        </CommandGroup>
        <CommandGroup heading="Pages">
          {ALL_PAGES.map((p) => <CommandItem key={p.href + p.label} onSelect={() => go(p.href)}><p.icon />{p.label}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Findings">
          {findings.map((f) => (
            <CommandItem key={f.id} value={`${f.id} ${f.title}`} onSelect={() => go(`/findings/${f.id}`)}>
              <Bug /><span className="font-mono text-xs text-muted-foreground">{f.id}</span>{f.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
