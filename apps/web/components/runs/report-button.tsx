"use client"
// "Download PDF report" for a finished run: GET /api/runs/{id}/report.pdf (AI narrative + Chromium PDF, cached per run).
import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { API_URL } from "@/lib/api"
import { notify } from "@/lib/notify"
import { accessToken } from "@/lib/supabase"

export function ReportButton({ runId, label }: { runId: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const token = await accessToken()
      const res = await fetch(`${API_URL}/api/runs/${encodeURIComponent(runId)}/report.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}))
        throw new Error(problem.detail ?? `Report failed (${res.status})`)
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `trevyn-report-${label}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      notify(`Report for ${label} downloaded`, "ok")
    } catch (e) { notify((e as Error).message, "bad") } finally { setBusy(false) }
  }
  return <Button variant="brand" size="pill" onClick={download} disabled={busy} aria-busy={busy}>
    {busy ? <><Loader2 className="animate-spin" />Preparing report…</> : <><FileDown />Download PDF report</>}
  </Button>
}
