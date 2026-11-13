import { supabase } from './supabase'

let sent = 0
/** Sends unexpected errors to the database (admin can read them under Staff → Error log). */
export function reportError(e: unknown, where?: string) {
  if (sent >= 10) return // per page load
  const base = e instanceof Error ? e : new Error(String((e as { reason?: unknown })?.reason ?? e))
  const detail = (e as { detail?: string })?.detail
  const err = where || detail ? Object.assign(new Error(`[${where ?? 'app'}] ${base.message}${detail ? ` (${detail})` : ''}`), { stack: base.stack }) : base
  if (/ResizeObserver loop|Load failed|Failed to fetch/i.test(err.message)) return
  sent++
  // Supabase queries are lazy: they only run when awaited/then-ed, so `void rpc(...)` alone would send nothing.
  supabase.rpc('log_client_error', {
    p_message: err.message, p_stack: err.stack ?? null, p_url: location.pathname, p_agent: navigator.userAgent,
  }).then(() => {}, () => {})
}

export function installErrorReporting() {
  addEventListener('error', ev => reportError(ev.error ?? ev.message))
  addEventListener('unhandledrejection', ev => reportError(ev.reason))
}
