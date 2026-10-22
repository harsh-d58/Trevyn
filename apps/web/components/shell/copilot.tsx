"use client"
// QA copilot: POST /api/assistant/chat streams answers grounded in the workspace (findings, runs, events).
// Also shows whether the dashboard is on live API data or demo fixtures (honesty rule, Part 16 step 5).
import { usePathname } from "next/navigation"
import { MessageCircle, Send, X } from "lucide-react"
import { useState } from "react"
import { Pill } from "@/components/kit/pills"
import { Button } from "@/components/ui/button"
import { API_URL, apiEnabled } from "@/lib/api"
import { cn } from "@/lib/utils"

type Msg = { role: "user" | "assistant"; content: string }

export function Copilot({ source }: { source: "live" | "demo" }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const findingId = path.match(/^\/findings\/([^/]+)/)?.[1]

  const send = async () => {
    const q = input.trim()
    if (!q || busy) return
    const history = msgs
    setMsgs([...history, { role: "user", content: q }, { role: "assistant", content: "" }])
    setInput("")
    setBusy(true)
    const append = (t: string) => setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: m[m.length - 1].content + t }])
    try {
      const res = await fetch(`${API_URL}/api/assistant/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, history, finding_id: findingId }),
      })
      if (!res.ok || !res.body) {
        append((await res.json().catch(() => ({}))).detail ?? "The copilot is unavailable.")
        return
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        const frames = buf.split(/\r?\n\r?\n/)
        buf = frames.pop() ?? ""
        for (const f of frames) {
          const ev = f.match(/^event: (.*)$/m)?.[1]
          const data = f.match(/^data: (.*)$/m)?.[1]
          if (ev === "delta" && data) append(JSON.parse(data).text)
          if (ev === "error" && data) append(`\n${JSON.parse(data).detail}`)
        }
      }
    } catch { append("Could not reach the API.") } finally { setBusy(false) }
  }

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40">
        <Pill tone={source === "live" ? "ok" : "warn"} dot>{source === "live" ? "Live API data" : "Demo data"}</Pill>
      </div>
      {apiEnabled && !open && (
        <Button variant="brand" size="pill" className="fixed right-5 bottom-5 z-40 shadow-lg" onClick={() => setOpen(true)}>
          <MessageCircle />Ask Trevyn
        </Button>)}
      {open && (
        <aside className="glass fixed right-5 bottom-5 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl shadow-2xl" aria-label="QA copilot">
          <header className="flex items-center justify-between border-b border-white/40 px-4 py-3">
            <div><b className="text-sm">QA copilot</b><p className="text-[11px] text-muted-foreground">Answers only from your runs and findings{findingId ? ` · focused on ${findingId}` : ""}</p></div>
            <button aria-label="Close copilot" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/40"><X size={16} /></button>
          </header>
          <div className="flex-1 space-y-2 overflow-auto px-4 py-3 text-[13px]">
            {!msgs.length && <p className="text-muted-foreground">Try: “Why was DEF-142 confirmed?” or “Summarise the last run.”</p>}
            {msgs.map((m, i) => (
              <p key={i} className={cn("rounded-xl px-3 py-2 whitespace-pre-wrap", m.role === "user" ? "ml-8 bg-[var(--brand)]/10" : "glass-inset mr-4")}>
                {m.content || (busy && i === msgs.length - 1 ? "Thinking…" : "")}
              </p>))}
          </div>
          <form className="flex gap-2 border-t border-white/40 p-3" onSubmit={(e) => { e.preventDefault(); send() }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about runs or findings"
              className="glass-inset h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none" aria-label="Message" />
            <Button variant="brand" size="pill" type="submit" disabled={busy}><Send /></Button>
          </form>
        </aside>)}
    </>
  )
}

