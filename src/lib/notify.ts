import type { Booking, Profile } from './types'
import { isManagerRole } from './types'
import { fmtDate, fmtTime, t2m } from './time'

export const canNotify = () => typeof Notification !== 'undefined'
export async function askNotifications() {
  if (canNotify() && Notification.permission === 'default') await Notification.requestPermission()
}
export function show(title: string, body: string) {
  if (canNotify() && Notification.permission === 'granted' && document.hidden) {
    try { new Notification(title, { body, icon: '/icon-192.png', tag: title + body }) } catch { /* some browsers need a service worker */ }
  }
}

/** Which realtime change deserves a message for this user, and what it says. */
export function messageFor(me: Profile, before: Booking | undefined, after: Booking, nameOf: (id: string | null) => string): string | null {
  const when = `${fmtDate(after.date)} at ${fmtTime(after.start_time)}`
  const mine = after.agent_id === me.id
  if (!before) return isManagerRole(me.role) && !mine ? `📋 New booking by ${nameOf(after.agent_id)} — ${when}, ${after.area}` : null
  if (before.status === after.status) return null
  if (mine && after.status === 'confirmed') return `✅ Your viewing ${when} is confirmed`
  if (mine && after.status === 'cancelled' && after.cancelled_by !== me.id) return `❌ Your viewing ${when} was cancelled${after.cancel_reason ? ' — ' + after.cancel_reason : ''}`
  if (mine && after.status === 'rescheduled') return `🔄 Your viewing was moved to ${when}`
  if (me.role === 'driver' && after.status === 'confirmed') return `🚗 New trip ${when} — ${after.area}`
  if (me.role === 'driver' && before.status === 'confirmed' && after.status === 'cancelled') return `❌ Trip ${when} cancelled`
  if (isManagerRole(me.role) && after.status === 'cancelled' && after.cancelled_by === after.agent_id) return `❌ ${nameOf(after.agent_id)} cancelled ${when}`
  return null
}

let timers: number[] = []
/** Local reminders 60 and 15 minutes before confirmed trips (owner and driver). */
export function scheduleReminders(me: Profile, bookings: Booking[], today: string, nowMins: number) {
  timers.forEach(clearTimeout); timers = []
  for (const b of bookings) {
    if (b.status !== 'confirmed' || b.date !== today) continue
    if (b.agent_id !== me.id && me.role !== 'driver') continue
    for (const before of [60, 15]) {
      const at = t2m(b.start_time) - before - nowMins
      if (at > 0) timers.push(window.setTimeout(() => show(`⏰ Viewing in ${before} min`, `${fmtTime(b.start_time)} — ${b.area}, ${b.location}`), at * 60_000))
    }
  }
}
