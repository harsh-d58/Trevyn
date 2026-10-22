// Typed fetch wrapper for services/api (BACKEND_AND_REMAINING_WORK.md Part 16).
// NEXT_PUBLIC_API_URL unset, or NEXT_PUBLIC_DEMO_MODE=1, keeps the dashboard on demo fixtures.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")
export const apiEnabled = !!API_URL && process.env.NEXT_PUBLIC_DEMO_MODE !== "1"

/** RFC 9457 problem+json from the API, with its `type` kept for friendly messages */
export class ApiError extends Error {
  constructor(public status: number, public type: string, message: string) { super(message) }
}

const FRIENDLY: Record<string, string> = {
  target_blocked: "This target isn't on the project's allowlist.",
  policy_denied: "Blocked by policy.",
  model_unavailable: "AI is off. Add ANTHROPIC_API_KEY to the API's .env.",
}

export async function api<T>(path: string, init: RequestInit & { idem?: string; json?: unknown } = {}): Promise<T> {
  const { idem, json, headers, ...rest } = init
  const res = await fetch(API_URL + path, {
    cache: "no-store", ...rest,
    method: rest.method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...(json !== undefined && { "content-type": "application/json" }), ...(idem && { "Idempotency-Key": idem }), ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  })
  if (!res.ok) {
    const p = await res.json().catch(() => ({}))
    throw new ApiError(res.status, p.type ?? "error", FRIENDLY[p.type] ?? p.detail ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** null when the API is disabled or unreachable, so callers can fall back to demo data */
export async function tryApi<T>(path: string): Promise<T | null> {
  if (!apiEnabled) return null
  try { return await api<T>(path) } catch { return null }
}

export type Items<T> = { items: T[] }
export type ApiEvent = {
  seq: number; ts: string; actor: "ai" | "det" | "human"; event_type: string; summary: string
  status: string | null; data: Record<string, unknown>; evidence_refs: string[]
}
export type ApiRun = {
  id: string; uuid: string; name: string; state: string; status: "running" | "passed" | "failed" | "warn" | "stopped"
  passed: number; total: number; counts: Record<string, number>; duration: string; started: string
}
export type ApiFindingDetail = {
  id: string; title: string; severity: "high" | "medium" | "low"; status: string; verdict: string; runId: string; test_case_id: string
  expected: string; actual: string; repro_steps: { action: string; target?: string; value?: string }[]
  verdict_detail: { status: string; rule: string; reason?: string; reproduced: string; checks: Record<string, boolean | string>; explanation?: string }
  diagnosis: { hypotheses: { statement: string; confidence: string; supporting_evidence_ids: string[] }[]; verified_observations: string[]; unknowns: string[] } | null
  repair_prompt: string | null
  evidence_items: { id: string; kind: string; sha256: string; bytes: number; url: string }[]
}
