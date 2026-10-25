import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const jar = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      // Server Components cannot set response cookies. proxy.ts refreshes them.
      setAll: () => {},
    },
  })
}
