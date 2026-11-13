import type { Booking, Profile } from './types'
import { isManagerRole } from './types'
import { fmtDate, fmtTime } from './time'

/** Which realtime change deserves a message for this user, and what it says. */
export function messageFor(me: Profile, before: Booking | undefined, after: Booking, nameOf: (id: string | null) => string): string | null {
  const when = `${fmtDate(after.date)} at ${fmtTime(after.start_time)}`
  const mine = after.agent_id === me.id
  if (!before) return isManagerRole(me.role) && !mine ? `New booking by ${nameOf(after.agent_id)} — ${when}, ${after.area}` : null
  if (before.status === after.status) return null
  if (mine && after.status === 'confirmed') return `Your viewing ${when} is confirmed`
  if (mine && after.status === 'cancelled' && after.cancelled_by !== me.id) return `Your viewing ${when} was cancelled${after.cancel_reason ? ' — ' + after.cancel_reason : ''}`
  if (mine && after.status === 'rescheduled') return `Your viewing was moved to ${when}`
  if (me.role === 'driver' && after.status === 'confirmed') return `New trip ${when} — ${after.area}`
  if (me.role === 'driver' && before.status === 'confirmed' && after.status === 'cancelled') return `Trip ${when} cancelled`
  if (isManagerRole(me.role) && after.status === 'cancelled' && after.cancelled_by === after.agent_id) return `${nameOf(after.agent_id)} cancelled ${when}`
  return null
}
