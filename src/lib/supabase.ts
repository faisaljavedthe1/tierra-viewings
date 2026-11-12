import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Turns Postgres / network errors into a sentence staff can act on. */
export function friendly(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection — check your internet and try again.'
  if (/JWT|session|not authenticated/i.test(m)) return 'Your session expired. Please sign in again.'
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.'
  if (/one_driver_no_overlap/.test(m)) return 'Driver is already booked at that time. Choose another time.'
  return m.replace(/^.*?ERROR:\s*/, '')
}
