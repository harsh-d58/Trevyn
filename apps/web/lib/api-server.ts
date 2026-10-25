import "server-only"
import { API_URL, apiEnabled, ApiError } from "./api"
import { serverSupabase } from "./supabase-server"

export async function serverApi<T>(path: string): Promise<T> {
  const sb = await serverSupabase()
  let token: string | undefined
  if (sb) {
    const { data: claims, error } = await sb.auth.getClaims()
    if (!error && claims?.claims) {
      const { data } = await sb.auth.getSession()
      token = data.session?.access_token
    }
  }
  const res = await fetch(API_URL + path, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}))
    throw new ApiError(res.status, problem.type ?? "error", problem.detail ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function tryServerApi<T>(path: string): Promise<T | null> {
  if (!apiEnabled) return null
  try { return await serverApi<T>(path) } catch { return null }
}
