"use client"
// Toned toast helper replacing the prototype store's toast(msg, tone).
import { toast, type ExternalToast } from "sonner"

const DOT = { ok: "#45dcc6", bad: "#ff8080", warn: "#f0c04a", ai: "#b9a8ff", det: "#45dcc6", human: "#f7ae47" } as const
export type NotifyTone = keyof typeof DOT

export function notify(message: string, tone: NotifyTone = "ok", opts?: ExternalToast) {
  return toast(message, { icon: <i className="block size-2 rounded-full" style={{ background: DOT[tone] }} />, ...opts })
}
