"use client"
// Signed-in user (blueprint Step 2): name/email/role from GET /api/me and sign out. With Supabase off it is a static "Local dev" avatar.
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { api, apiEnabled } from "@/lib/api"
import { authEnabled, supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Me = { name?: string | null; email?: string | null; role?: string; approver?: boolean }
const initials = (s: string) => s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"

function useMe(): Me | null {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    const sb = supabase()
    if (!sb) return
    let alive = true
    const load = async () => {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      if (!u) { router.replace("/login"); return }
      const base: Me = { email: u.email, name: (u.user_metadata?.full_name as string | undefined) ?? u.email }
      const fromApi = apiEnabled ? await api<Me>("/api/me").catch(() => null) : null
      if (alive) setMe({ ...base, ...fromApi })
    }
    load()
    const { data: sub } = sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") router.replace("/login"); else if (e === "SIGNED_IN") load() })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [router])
  return me
}

export function UserMenu({ className, children }: { className?: string; children?: React.ReactNode }) {
  const me = useMe()
  const badge = (label: string) => (
    <span className={cn("grid size-9 place-items-center rounded-full bg-[hsl(222_70%_90%)] text-[11px] font-bold text-[hsl(222_60%_32%)] ring-2 ring-white", className)}>{label}</span>
  )
  if (!authEnabled) return <span title="Local dev · sign-in off" className="group relative rounded-full outline-none" tabIndex={0}>{badge("LD")}{children}</span>
  const who = me?.name || me?.email || "Signed in"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button aria-label={`Account: ${who}`} className="group relative rounded-full outline-none" />}>
        {badge(me ? initials(who) : "…")}{children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="glass-2 w-60 rounded-2xl bg-[var(--g2)] p-1.5 ring-0">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-[13px] font-semibold text-foreground">{who}</div>
            {me?.email && me.email !== who && <div className="text-[12px] text-muted-foreground">{me.email}</div>}
            {me?.role && <div className="text-[11.5px] text-muted-foreground capitalize">{me.role}{me.approver ? " · approver" : ""}</div>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => supabase()?.auth.signOut()}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
