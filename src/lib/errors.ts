import { supabase } from './supabase'

let sent = 0
/** Sends unexpected errors to the database (admin can read them under Staff → Error log). */
export function reportError(e: unknown) {
  if (sent >= 10) return // per page load
  const err = e instanceof Error ? e : new Error(String((e as { reason?: unknown })?.reason ?? e))
  if (/ResizeObserver loop|Load failed|Failed to fetch/i.test(err.message)) return
  sent++
  void supabase.rpc('log_client_error', {
    p_message: err.message, p_stack: err.stack ?? null, p_url: location.pathname, p_agent: navigator.userAgent,
  })
}

export function installErrorReporting() {
  addEventListener('error', ev => reportError(ev.error ?? ev.message))
  addEventListener('unhandledrejection', ev => reportError(ev.reason))
}
