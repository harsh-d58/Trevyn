// Browser-only Supabase client (blueprint Step 2). null unless both public env vars are set, so local dev keeps working without auth.
import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
export const authEnabled = !!URL && !!KEY

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (!authEnabled || typeof window === "undefined") return null
  return (client ??= createBrowserClient(URL, KEY))
}

/** current access token, or null when auth is off / signed out */
export async function accessToken(): Promise<string | null> {
  const sb = supabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}
