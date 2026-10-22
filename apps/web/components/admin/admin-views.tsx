"use client"
// Administration (from Admin.jsx): Integrations, Policies & access, Settings (+ Appearance, glass spec C.16).
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
import { useState } from "react"
import { Appearance } from "@/components/shell/appearance"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { PageHeader } from "@/components/kit/page-header"
import { Pill, hue } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { ALLOWLIST, INTEGRATIONS, PERMS, PROVIDERS, RBAC, ROLES, SECRETS } from "@/lib/demo/insights"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const field = "glass-inset h-9 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none"

export function IntegrationsView() {
  const [on, setOn] = useState(() => INTEGRATIONS.map((i) => i[3]))
  return (
    <div className="grid gap-3.5">
      <PageHeader title="Integrations" sub="Trevyn coordinates mature tools. Connect the ones your team already uses."><Pill tone="det">{on.filter(Boolean).length} connected</Pill></PageHeader>
      {/* one glass container, inset tiles: 13 blurred cards would exceed the glass budget */}
      <div className="glass-1 grid gap-2 rounded-[22px] p-2 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map(([n, d, c], i) => (
          <motion.label key={n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className={cn("glass-inset flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition-colors", on[i] && "bg-white/70")}>
            <span style={{ "--h": hue(n) } as React.CSSProperties} className="grid size-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--h)_55%_90%)] font-semibold text-[hsl(var(--h)_50%_30%)]">{n[0]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <b className="font-semibold">{n}</b>
                <Switch checked={on[i]} aria-label={n} onCheckedChange={(v) => { setOn((o) => o.map((x, j) => (j === i ? v : x))); notify(`${n} ${v ? "connected" : "disconnected"}`, v ? "ok" : "warn") }} />
              </div>
              <div className="text-[13px] text-muted-foreground">{d}</div>
              <Pill className="mt-1.5">{c}</Pill>
            </div>
          </motion.label>
        ))}
      </div>
    </div>
  )
}

const K = ({ children }: { children: React.ReactNode }) => <span className="text-ai">{children}</span>
const Str = ({ children }: { children: React.ReactNode }) => <span className="text-det">{children}</span>

export function PoliciesView() {
  const [allow, setAllow] = useState(ALLOWLIST)
  const [host, setHost] = useState("")
  const [bad, setBad] = useState(0)
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const v = host.trim()
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) { setBad((n) => n + 1); return notify("Enter a host name like staging.example.com", "bad") }
    if (/prod|^www\./.test(v)) { setBad((n) => n + 1); return notify("Production hosts cannot be added. Use a staging host.", "bad") }
    if (allow.includes(v)) return notify(`${v} is already allowed`, "warn")
    setAllow((a) => [...a, v]); setHost(""); notify(`${v} added to allowlist`)
  }
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Administration" title="Policies & access" sub="Policy-as-code with OPA. Every run, test and patch goes through this gate." />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card title="trevyn/gate.rego" extra={<Pill tone="ok">v12 · active</Pill>}>
          <pre className="glass-inset overflow-x-auto rounded-2xl p-4 font-mono text-[12.5px] leading-relaxed">
            <K>package</K> trevyn.gate{"\n\n"}<K>default</K> allow := <K>false</K>{"\n\n"}allow <K>if</K> {"{"}{"\n"}  input.target.host <K>in</K> data.allowlist{"\n"}  input.environment != <Str>&quot;production&quot;</Str>{"\n"}  <K>not</K> high_risk_without_approval{"\n"}{"}"}{"\n\n"}high_risk_without_approval <K>if</K> {"{"}{"\n"}  input.test.risk == <Str>&quot;high&quot;</Str>{"\n"}  <K>not</K> input.approvals[input.test.id]{"\n"}{"}"}{"\n\n"}<span className="text-muted-foreground"># No fix passes until tests pass</span>{"\n"}deny_patch_merge <K>if</K> {"{"}{"\n"}  input.patch.regression.status != <Str>&quot;passed&quot;</Str>{"\n"}{"}"}
          </pre>
        </Card>
        <div className="grid content-start gap-3.5">
          <Card title="Target allowlist">
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {allow.map((a) => (
                  <motion.span key={a} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    className="glass-inset flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 font-mono text-[11.5px]">{a}
                    <button aria-label={`Remove ${a}`} className="press grid size-5 place-items-center rounded-full hover:bg-black/5" onClick={() => { setAllow((l) => l.filter((x) => x !== a)); notify(`${a} removed from allowlist`, "warn") }}><X size={12} /></button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <form onSubmit={add} className="mt-3 flex gap-2">
              <Input key={bad} className={cn(field, bad > 0 && "shake")} placeholder="staging.example.com" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Host to allow" />
              <Button type="submit" variant="glass" size="pill">Add</Button>
            </form>
          </Card>
          <Card title="Managed secrets">
            {SECRETS.map(([n, r]) => (
              <div key={n} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                <div><div className="text-[13px] font-medium">{n}</div><div className="font-mono text-[11px] text-muted-foreground">{r}</div></div>
                <span className="font-mono text-[11.5px] text-muted-foreground">••••••••</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
      <Card flush title="Role-based access" caption="Owner permissions are fixed">
        <DataTable head={["Permission", ...ROLES]} minWidth={640}>
          {PERMS.map((p, j) => (
            <Row key={p}>
              <Cell className="font-medium">{p}</Cell>
              {ROLES.map((r, i) => <Cell key={r} className="text-center"><Checkbox defaultChecked={!!RBAC[i][j]} disabled={i === 0} aria-label={`${r}: ${p}`} className="mx-auto" onCheckedChange={(v) => notify(`${r} ${v ? "can now" : "can no longer"} ${p.toLowerCase()}`, v ? "ok" : "warn")} /></Cell>)}
            </Row>
          ))}
        </DataTable>
      </Card>
    </div>
  )
}

export function SettingsView() {
  const [prov, setProv] = useState("anthropic")
  const [n, setN] = useState([true, true, false])
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Administration" title="Settings" sub="Workspace preferences for models, budgets, notifications and appearance." />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Card title="AI models" caption="All AI output is schema-validated before any tool runs.">
          <RadioGroup value={prov} onValueChange={(v) => { setProv(v as string); notify(`Model routing set to ${PROVIDERS.find((p) => p[0] === v)?.[1]}`, "ai") }} className="grid gap-2.5">
            {PROVIDERS.map(([k, t, d]) => (
              <label key={k} className={cn("press flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition", prov === k ? "glass-2 border-brand ring-3 ring-brand/15" : "glass-inset")}>
                <RadioGroupItem value={k} aria-label={t} /><span><b className="font-semibold">{t}</b><br /><span className="text-[13px] text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </RadioGroup>
        </Card>
        <Card title="Budgets & notifications">
          <div className="grid gap-3.5">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">Monthly model budget (USD)<Input className={field} type="number" defaultValue={250} /></label>
            {["Email me when a run fails", "Slack alert for high-severity findings", "Daily quality digest"].map((l, i) => (
              <label key={l} className="flex items-center justify-between text-[13px]">{l}<Switch checked={n[i]} aria-label={l} onCheckedChange={(v) => setN((s) => s.map((x, j) => (j === i ? v : x)))} /></label>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Appearance" caption="Wallpaper, accent and glass apply instantly and are remembered on this device.">
        <div className="max-w-xl"><Appearance /></div>
        <Button variant="glass" size="pill-sm" className="mt-3 w-fit" onClick={() => { try { localStorage.removeItem("trevyn.hint.dismissed") } catch {}; notify("The shortcut hint will show again on next load") }}>Show shortcut hint again</Button>
      </Card>
    </div>
  )
}
