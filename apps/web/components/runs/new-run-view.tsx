"use client"
// Create test run (PORTING_PLAN.md P1.1, from trevyn-app Runs.jsx NewRun): 5-step wizard beside a run
// manifest ticket that fills in as you go. Launch goes through the store's policy check, then /runs/live.
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowLeft, ArrowRight, Check, CirclePlay, Lock, Sparkles } from "lucide-react"
import { useState } from "react"
import { Stepper } from "@/components/charts/progress"
import { Card } from "@/components/kit/card"
import { Cell, DataTable, Row } from "@/components/kit/data-table"
import { CheckLine, Note } from "@/components/kit/meters"
import { PageHeader } from "@/components/kit/page-header"
import { MonoLabel, Pill } from "@/components/kit/pills"
import { Barcode, Perforation } from "@/components/kit/ticket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ATTACHMENTS, MODES, SUITES, WIZARD_DEFAULTS, WIZARD_STEPS, WIZARD_SUBS, type Env, type RunConfig } from "@/lib/demo/runs"
import { api, apiEnabled } from "@/lib/api"
import { useLiveStore } from "@/lib/live"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

const ENVS: { value: Env; label: string }[] = [{ value: "staging", label: "Staging · DEMO" }, { value: "qa", label: "QA" }, { value: "prod", label: "Production (blocked by policy)" }]
const field = "glass-inset h-9 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none"

function Field({ label, hint, value, onChange, placeholder, disabled }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[12.5px] font-medium">
      {label}
      <Input className={field} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {hint && <small className="font-normal text-muted-foreground">{hint}</small>}
    </label>
  )
}

function M({ l, children, mono, bad }: { l: string; children: React.ReactNode; mono?: boolean; bad?: boolean }) {
  return (
    <>
      <dt className="pt-px font-mono text-[10px] tracking-[.12em] text-muted-foreground uppercase">{l}</dt>
      <dd className={cn("min-w-0 break-words", mono ? "font-mono text-[11.5px]" : "font-medium", bad && "text-bad")}>{children}</dd>
    </>
  )
}

export function NewRunView() {
  const router = useRouter()
  const store = useLiveStore()
  const [step, setStep] = useState(0)
  const [w, setW] = useState<RunConfig>(WIZARD_DEFAULTS)
  const [shake, setShake] = useState(0)
  const set = <K extends keyof RunConfig>(k: K) => (v: RunConfig[K]) => setW((s) => ({ ...s, [k]: v }))
  // A verified public repository adds a file map to URL-based planning.
  const [modePicked, setModePicked] = useState(false)
  const recommended: RunConfig["mode"] = w.repo.trim() ? "gray" : "black"
  const mode = apiEnabled && !w.repo.trim() ? "black" : modePicked ? w.mode : recommended
  const prod = w.env === "prod"
  const suites = SUITES.filter((s) => w.suites[s.key])

  const [launching, setLaunching] = useState(false)
  const [launchMessage, setLaunchMessage] = useState("")
  const launch = async () => {
    if (apiEnabled) { // real path: plan (AI or template) → approve → run → stream it
      if (prod) { notify("Blocked by policy: production targets are not allowed.", "bad"); setShake((n) => n + 1); return }
      setLaunching(true)
      try {
        if (!w.url.trim() || !w.req.trim()) { notify("Enter the application URL and what to test first.", "bad"); setShake((n) => n + 1); return }
        const url = w.url.trim()
        const same = (u: string) => u.replace(/\/$/, "") === url.replace(/\/$/, "")
        const { items } = await api<{ items: { id: string; environments: { base_url: string }[] }[] }>("/api/projects")
        const project = items.find((p) => p.environments.some((e) => same(e.base_url)))
          ?? await api<{ id: string }>("/api/projects", { json: { name: w.name.trim() || new URL(url).host, base_url: url, authorised: true } })
        if (w.repo.trim()) {
          setLaunchMessage("Verifying the public GitHub repository and resolving its commit…")
          const repo = await api<{ url: string; ref: string; sha: string }>(`/api/projects/${project.id}/repository`,
            { method: "PUT", json: { url: w.repo.trim(), ref: w.branch.trim() || null } })
          notify(`Connected ${repo.url} at ${repo.ref} (${repo.sha.slice(0, 8)})`, "ok")
        }
        setLaunchMessage("Scanning the site (up to 10 pages) and generating a grounded plan…")
        notify("Scanning the site and generating the test plan…", "ok")
        const plan = await api<{ id: string; test_cases: unknown[]; source: string }>(`/api/projects/${project.id}/plans`, { json: { requirement: w.req, mode: `${mode}_box` } })
        await api(`/api/plans/${plan.id}/approve`, { method: "POST" })
        const run = await api<{ id: string; uuid: string }>("/api/runs", { json: { plan_id: plan.id, name: w.name.trim() || undefined }, idem: crypto.randomUUID() })
        notify(`Run ${run.id} queued · ${plan.test_cases.length} tests (${plan.source} plan). Policy gate passed.`)
        router.push(`/runs/live?run=${run.uuid}`)
      } catch (e) { notify((e as Error).message, "bad"); setShake((n) => n + 1) } finally { setLaunching(false); setLaunchMessage("") }
      return
    }
    const res = store.launchRun({ name: w.name, env: w.env })
    if (!res.ok) { notify(res.reason!, "bad"); setShake((n) => n + 1); return }
    notify(`Run ${res.id} queued. Policy gate passed.`)
    router.push("/runs/live")
  }

  const body = [
    <div key="app" className="grid gap-3.5 sm:grid-cols-2">
      <Field label="Project name" placeholder="e.g. My web app" value={w.name} onChange={set("name")} />
      <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">Environment
        <Select value={w.env} onValueChange={(v) => v && set("env")(v as Env)} items={ENVS}>
          <SelectTrigger className={cn(field, "w-full", prod && "text-bad")}><SelectValue /></SelectTrigger>
          <SelectContent className="glass-2 rounded-xl bg-[var(--g2)] ring-0">{ENVS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <Field label="Application URL" hint="Only a site you own or are allowed to test" placeholder="https://staging.example.com" value={w.url} onChange={set("url")} />
      <Field label="Public GitHub repository (optional)" hint="Verified and linked to this project; its file map helps plan browser tests." placeholder="https://github.com/org/repo" value={w.repo} onChange={set("repo")} />
      <Field label="Branch or ref" hint="Leave blank to use the repository's default branch." placeholder="Default branch" value={w.branch} onChange={set("branch")} disabled={apiEnabled && !w.repo.trim()} />
      <Field label="Test account reference" placeholder="e.g. qa-user-01" value={w.acct} onChange={set("acct")} disabled={apiEnabled} />
      <Field label="Secret reference" hint={apiEnabled ? "Test account support is planned for live runs." : "A reference to the vault, never a plaintext value"} placeholder="vault://project/test-user" value={w.secret} onChange={set("secret")} disabled={apiEnabled} />
    </div>,
    <div key="req">
      <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">What should the application do?
        <Textarea className="glass-inset min-h-28 rounded-xl border-0 bg-[var(--gi)] text-[13px] shadow-none" placeholder="Describe what to test, e.g. Users can sign up, log in and place one order per checkout." value={w.req} onChange={(e) => set("req")(e.target.value)} />
      </label>
      <div className="my-3 flex gap-2"><Pill tone="ok"><Check size={12} />Evidence-linked</Pill><Pill tone="human">1 ambiguity flagged</Pill></div>
      <Note icon={Sparkles}><b className="font-semibold">Ambiguity:</b> “exactly one order per checkout action”. Should a retried request after a timeout count as the same action? Trevyn will assume yes and mark tests that depend on it.</Note>
      <div className="glass-inset mt-4 overflow-hidden rounded-2xl">
        <DataTable head={["Attachment", "Type", "Status"]}>
          {ATTACHMENTS.map(([a, t, s]) => <Row key={a}><Cell className="font-mono text-[11.5px]">{a}</Cell><Cell>{t}</Cell><Cell><Pill tone="ok">{s}</Pill></Cell></Row>)}
        </DataTable>
      </div>
    </div>,
    <div key="mode" className="grid gap-2.5 md:grid-cols-3">
      <p className="text-[12.5px] text-muted-foreground sm:col-span-full">
        {apiEnabled
          ? w.repo.trim()
            ? "Trevyn verifies the public repository and reads its file map for planning. Tests still execute against the public URL in a browser."
            : "Live runs test the public URL through the browser. Add a public GitHub repository to include its file map in planning."
          : w.repo.trim()
          ? "A repository is set, so Gray-box is recommended: Trevyn can combine browser tests with what the code and API schema reveal."
          : "Only a URL is set, so Black-box is recommended: Trevyn tests the live site through the browser, the way a user would. Add a repository URL to unlock Gray-box."}
      </p>
      {MODES.map((m, j) => {
        const on = mode === m.key
        return (
          <button key={m.key} disabled={apiEnabled && (m.key === "white" || (m.key === "gray" && !w.repo.trim()))} onClick={() => { setModePicked(true); set("mode")(m.key) }} aria-pressed={on}
            className={cn("press pulse flex flex-col gap-2 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50", on ? "glass-2 border-brand ring-3 ring-brand/15" : "glass-inset hover:border-brand/40")}>
            <span className="flex w-full items-center justify-between"><MonoLabel>Mode 0{j + 1}</MonoLabel><span className="flex gap-1.5">{apiEnabled && m.key === "white" && <Pill tone="mut">Planned</Pill>}{m.key === recommended && <Pill tone="ok">Recommended</Pill>}{on && <Pill tone="brand">Selected</Pill>}</span></span>
            <h4 className="font-semibold">{m.title}</h4>
            <span className="text-[13px] text-muted-foreground">{apiEnabled && m.key === "gray" ? "Adds the public repository's file map to browser test planning." : m.desc}</span>
            <span className="mt-auto flex items-start gap-1 border-t border-dashed border-border pt-2 font-mono text-[11px]"><Check size={12} className="mt-0.5 shrink-0 text-ok" />{apiEnabled && m.key === "gray" ? "Verified public GitHub repository" : apiEnabled && m.key === "black" ? "Approved public URL" : m.access}</span>
          </button>
        )
      })}
    </div>,
    <div key="suites" className="grid gap-2">
      {SUITES.map((s) => (
        <label key={s.key} className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition", w.suites[s.key] ? "border-det/40 bg-det/6" : "glass-inset")}>
          <div className="flex-1"><h4 className="font-semibold">{s.title}</h4><span className="font-mono text-[11.5px] text-muted-foreground">{s.desc}</span></div>
          <span className="font-mono text-[11px] text-muted-foreground tabular">{s.eta}</span>
          <Switch checked={w.suites[s.key]} onCheckedChange={(v) => setW((x) => ({ ...x, suites: { ...x.suites, [s.key]: v } }))} aria-label={s.title} />
        </label>
      ))}
    </div>,
    <div key="safety">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-3 text-[12.5px] font-medium">Time budget · {w.budget} min
          <Slider value={w.budget} min={5} max={60} step={5} onValueChange={(v) => set("budget")(Array.isArray(v) ? v[0] : v)} aria-label="Time budget in minutes" />
        </div>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">Parallel workers
          <Select value={String(w.workers)} onValueChange={(v) => v && set("workers")(Number(v))}>
            <SelectTrigger className={cn(field, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent className="glass-2 rounded-xl bg-[var(--g2)] ring-0">{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
      <div className="my-4.5 grid gap-3">
        {([["synthetic", "Synthetic test data only"], ["stopcrit", "Stop on first critical failure"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between text-[13px]">{l}<Switch checked={w[k]} onCheckedChange={(v) => set(k)(v)} aria-label={l} /></label>
        ))}
      </div>
      <h4 className="mb-1.5 text-[13px] font-semibold">Policy pre-check</h4>
      {prod ? <CheckLine k="bad">Target environment is production: blocked</CheckLine> : <CheckLine>Target is on the allowlist</CheckLine>}
      {apiEnabled ? <CheckLine k="warn">Test account connection is planned</CheckLine> : <CheckLine>Secrets resolved by reference</CheckLine>}
      <CheckLine>Egress limited to target host</CheckLine>
      <CheckLine k="warn">{apiEnabled ? "Write-like actions pause for human approval" : "2 high-impact tests will pause for human approval"}</CheckLine>
    </div>,
  ]

  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow={`Step ${step + 1} of 5`} title="Create test run" sub="Configure an authorised application and a controlled test run." />
      <Stepper steps={WIZARD_STEPS} step={step} onStep={setStep} />
      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card flush>
          <div className="p-4">
            <MonoLabel>Step 0{step + 1}</MonoLabel>
            <h3 className="mt-0.5 text-[15px] font-semibold">{WIZARD_STEPS[step]}</h3>
            <p className="mt-1 mb-4 text-[13px] text-muted-foreground">{apiEnabled && step === 0 ? "Connect a public URL and, optionally, a public GitHub repository." : apiEnabled && step === 1 ? "Describe the behaviour to test. Site and repository observations guide the plan when AI is available." : WIZARD_SUBS[step]}</p>
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>{body[step]}</motion.div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3.5">
            <Button variant="glass" size="pill" disabled={!step} onClick={() => setStep(step - 1)}><ArrowLeft />Back</Button>
            <div className="flex gap-2">
              <Button variant="glass" size="pill" onClick={() => notify("Draft saved")}>Save draft</Button>
              {step < 4
                ? <Button variant="brand" size="pill" onClick={() => setStep(step + 1)}>Continue<ArrowRight /></Button>
                : <Button key={shake} variant="brand" size="pill" className={cn(shake > 0 && "shake")} onClick={launch} disabled={launching}><CirclePlay />{launching ? "Scanning…" : "Launch run"}</Button>}
            </div>
          </div>
          {launchMessage && <p role="status" className="px-4 pb-3 text-[12px] text-muted-foreground">{launchMessage}</p>}
        </Card>

        {/* run manifest: a ticket that fills in as the wizard progresses */}
        <aside className="glass-1 spot h-fit rounded-[22px]">
          <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-3">
            <div><MonoLabel className="text-foreground/70">Run manifest</MonoLabel><div className="mt-1 font-mono text-[13px] font-semibold">RUN-next · draft</div></div>
            <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider", prod ? "border-bad/40 text-bad" : "border-human/40 text-human")}>
              {prod ? "PROD · BLOCKED" : `${w.env.toUpperCase()} · DEMO`}
            </span>
          </div>
          <Perforation />
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2.5 px-4 py-3.5 text-[13px]">
            <M l="Project">{w.name}</M><M l="Target" mono>{w.url}</M><M l="Ref" mono>{apiEnabled ? w.repo.trim() ? w.branch.trim() || "Default branch" : "No repository" : w.branch}</M><M l="Account" mono>{apiEnabled ? "Not connected" : w.acct}</M>
          </dl>
          <div className="mx-4 border-t border-dashed border-border" />
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2.5 px-4 py-3.5 text-[13px]">
            <M l="Mode">{MODES.find((m) => m.key === mode)?.title}</M>
            <M l="Suites">{apiEnabled ? "URL browser tests" : suites.length ? <span className="flex flex-wrap gap-1">{suites.map((s) => <span key={s.key} className="rounded bg-det/12 px-1.5 py-px font-mono text-[10.5px] text-det">{s.title}</span>)}</span> : <span className="text-muted-foreground">None</span>}</M>
            <M l="Budget" mono>{apiEnabled ? "Runner default" : `${w.budget} min · ${w.workers} workers`}</M>
            <M l="Gate" mono bad={prod}>{prod ? "deny · production target" : apiEnabled ? "write actions need approval" : "allow · 2 tests need approval"}</M>
          </dl>
          <Perforation />
          <div className="flex items-end justify-between gap-3 px-4 pt-3.5 pb-4">
            <div><Barcode s={w.name + w.url + mode} n={34} /><div className="mt-1 font-mono text-[9.5px] tracking-[.2em] text-muted-foreground">TRV·NEXT·{mode.toUpperCase()}</div></div>
            <Lock size={15} className="mb-4 text-muted-foreground" />
          </div>
          <Note tone="human" icon={Lock} className="mx-4 mb-4">{apiEnabled ? "Authorised URLs only. Public GitHub files are read for planning; repository test scripts are not run automatically." : "Authorised targets only. Production is blocked by default. Secrets stay referenced and are never shown."}</Note>
        </aside>
      </div>
    </div>
  )
}
