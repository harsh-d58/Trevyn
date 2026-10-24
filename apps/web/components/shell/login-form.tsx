"use client"
// Sign in (blueprint Step 2): email magic link or GitHub OAuth through Supabase. Without Supabase env vars it explains local dev mode.
import Link from "next/link"
import { GitBranch, Mail } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/notify"
import { authEnabled, supabase } from "@/lib/supabase"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const redirectTo = () => `${window.location.origin}/`

  const magic = async (e: React.FormEvent) => {
    e.preventDefault()
    const sb = supabase()
    if (!sb || !email) return
    setBusy(true)
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } })
    setBusy(false)
    if (error) notify(error.message, "bad")
    else setSent(true)
  }
  const github = async () => {
    const { error } = (await supabase()?.auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectTo() } })) ?? {}
    if (error) notify(error.message, "bad")
  }

  return (
    <div className="glass-2 grid w-full max-w-sm gap-4 rounded-3xl p-6">
      <div>
        <span className="font-display text-[26px] tracking-[.06em] text-navy">TREVYN</span>
        <p className="text-[13px] text-muted-foreground">Sign in to your QA workspace.</p>
      </div>
      {!authEnabled ? (
        <div className="grid gap-3 text-[13px]">
          <p>Sign-in is off: <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are not set. You are in local dev mode.</p>
          <Button variant="brand" size="pill" render={<Link href="/" />}>Open workspace</Button>
        </div>
      ) : sent ? (
        <p className="text-[13px]">Check <b>{email}</b> for a sign-in link.</p>
      ) : (
        <>
          <form onSubmit={magic} className="grid gap-2">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">Work email
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <Button type="submit" variant="brand" size="pill" disabled={busy}><Mail />{busy ? "Sending…" : "Email me a magic link"}</Button>
          </form>
          <div className="text-center text-[11.5px] text-muted-foreground">or</div>
          <Button variant="glass" size="pill" onClick={github}><GitBranch />Continue with GitHub</Button>
        </>
      )}
    </div>
  )
}
