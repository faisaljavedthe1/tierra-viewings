// Who gets a phone notification for each booking change, and what it says. Pure logic (unit tested).
// Notifications never include client details (purpose, notes, client reference).

export interface Person { id: string; full_name: string; role: string }
export interface PushBooking {
  id: string; agent_id: string | null; date: string; start_time: string; area: string; location: string
  status: string; cancelled_by: string | null; cancel_reason: string | null
}
export interface Push { user_id: string; title: string; body: string; tag: string; url: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const time = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
function day(d: string, today: string) {
  const x = new Date(d + 'T00:00:00Z'), t = new Date(today + 'T00:00:00Z')
  const diff = Math.round((x.getTime() - t.getTime()) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`
}
const isManager = (p: Person) => p.role === 'manager' || p.role === 'admin'

export function pushesFor(oldStatus: string | null, b: PushBooking, people: Person[], today: string): Push[] {
  const when = `${day(b.date, today)} ${time(b.start_time)} · ${b.area}`
  const name = (id: string | null) => people.find(p => p.id === id)?.full_name ?? 'Someone'
  const drivers = people.filter(p => p.role === 'driver')
  const out: Push[] = []
  const add = (ids: (string | null)[], title: string, body: string, url = '/') =>
    ids.forEach(id => id && !out.some(o => o.user_id === id) && out.push({ user_id: id, title, body, tag: `${b.id}:${b.status}`, url }))

  if (oldStatus === null) {
    add(people.filter(p => isManager(p) && p.id !== b.agent_id).map(p => p.id), '📋 New booking', `${name(b.agent_id)} · ${when}`, '/manage')
    return out
  }
  if (oldStatus === b.status) return out
  if (b.status === 'confirmed') {
    add([b.agent_id], '✅ Viewing confirmed', when, '/mine')
    add(drivers.map(d => d.id), '🚗 New trip', `${when} — ${b.location}`, '/trips')
  } else if (b.status === 'cancelled') {
    if (b.cancelled_by === b.agent_id) add(people.filter(p => isManager(p) && p.id !== b.agent_id).map(p => p.id), '❌ Booking cancelled', `${name(b.agent_id)} · ${when}`, '/manage')
    else add([b.agent_id], '❌ Viewing cancelled', `${when}${b.cancel_reason ? ' — ' + b.cancel_reason : ''}`, '/mine')
    if (oldStatus === 'confirmed') add(drivers.map(d => d.id), '❌ Trip cancelled', when, '/trips')
  } else if (b.status === 'rescheduled') {
    add([b.agent_id], '🔄 Viewing moved', `${when} — waiting for confirmation`, '/mine')
  }
  return out
}

/** Reminder due now (60 or 15 minutes before a confirmed trip), checked every 5 minutes. */
export function reminderFor(b: PushBooking, today: string, nowMins: number, people: Person[]) {
  if (b.status !== 'confirmed' || b.date !== today) return null
  const [h, m] = b.start_time.split(':').map(Number), until = h * 60 + m - nowMins
  const kind = until > 55 && until <= 65 ? 'r60' : until > 10 && until <= 20 ? 'r15' : null
  if (!kind) return null
  const users = [b.agent_id, ...people.filter(p => p.role === 'driver').map(p => p.id)].filter((x): x is string => !!x)
  return { kind, users, title: `⏰ Viewing in ${kind === 'r60' ? '1 hour' : '15 minutes'}`, body: `${time(b.start_time)} · ${b.area} — ${b.location}` }
}
