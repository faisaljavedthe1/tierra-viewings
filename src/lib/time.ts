import type { Booking, BookingInput } from './types'
import { ACTIVE } from './types'

/** Working hours in minutes from midnight (Dubai): 9:30 AM – 6:00 PM. */
export const WS = 9 * 60 + 30
export const WE = 18 * 60
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const m2t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export function fmtTime(t: string) {
  const m = t2m(t), h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0')
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}
export const fmtMins = (m: number) => fmtTime(m2t(m))

/** Dates are plain YYYY-MM-DD strings; maths is done in UTC so device timezones never shift them. */
const parse = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)) }
const ymd = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return ymd(x) }
export const addMonths = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); return ymd(new Date(Date.UTC(y, m - 1 + n, dd))) }
export const dow = (d: string) => parse(d).getUTCDay()
export const isSunday = (d: string) => dow(d) === 0
export const monday = (d: string) => addDays(d, -((dow(d) + 6) % 7))
export const weekDays = (mon: string) => [0, 1, 2, 3, 4, 5].map(i => addDays(mon, i))

const dubaiFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function dubaiParts(now: Date) {
  const p = Object.fromEntries(dubaiFmt.formatToParts(now).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) }
}
export const dubaiToday = (now = new Date()) => dubaiParts(now).date
export const dubaiNowMins = (now = new Date()) => dubaiParts(now).mins

export function fmtDate(d: string, today = dubaiToday()) {
  if (d === today) return 'Today'
  if (d === addDays(today, 1)) return 'Tomorrow'
  const x = parse(d)
  return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`
}

export const endMins = (b: Pick<Booking, 'start_time' | 'duration_mins'>) => t2m(b.start_time) + b.duration_mins
export const occupies = (b: Booking) => b.status !== 'cancelled'

/** Free stretches of at least an hour in the working day. */
export function gaps(day: Booking[]) {
  const occ = day.filter(occupies).map(b => ({ s: t2m(b.start_time), e: endMins(b) })).sort((a, z) => a.s - z.s)
  const out: { s: number; e: number }[] = []
  let cur = WS
  for (const o of occ) { if (o.s > cur) out.push({ s: cur, e: o.s }); cur = Math.max(cur, o.e) }
  if (cur < WE) out.push({ s: cur, e: WE })
  return out.filter(g => g.e - g.s >= 60)
}

export interface FieldError { field: keyof BookingInput; message: string }

/** Instant feedback in the form. The database enforces the same rules again. */
export function validateBooking(i: BookingInput, sameDay: Booking[], now = new Date(), excludeId?: string): FieldError[] {
  const e: FieldError[] = []
  const req = (f: keyof BookingInput, label: string) => { if (!String(i[f] ?? '').trim()) e.push({ field: f, message: `${label} is required` }) }
  req('date', 'Date'); req('start_time', 'Start time'); req('area', 'Area')
  if (i.trip_type === 'pickup') req('pickup_location', 'Pick-up point')
  req('location', i.trip_type === 'pickup' ? 'Destination' : 'Location'); req('purpose', 'Purpose')
  const h = Number(i.duration_hours)
  if (!(h >= 0.5 && h <= 8 && (h * 60) % 30 === 0)) e.push({ field: 'duration_hours', message: 'Duration must be 0.5 to 8 hours in 30-minute steps' })
  if (e.length || !i.date || !i.start_time) return e

  const today = dubaiToday(now), start = t2m(i.start_time), end = start + h * 60
  if (i.date < today) e.push({ field: 'date', message: 'Cannot book a date in the past' })
  else if (i.date > addMonths(today, 6)) e.push({ field: 'date', message: 'Bookings can be made up to 6 months ahead' })
  else if (isSunday(i.date)) e.push({ field: 'date', message: 'Sunday is a day off — no bookings' })
  else if (start < WS) e.push({ field: 'start_time', message: 'Viewings start at 9:30 AM — choose a later time' })
  else if (start >= WE) e.push({ field: 'start_time', message: 'No bookings starting at or after 6:00 PM' })
  else if (i.date === today && start < dubaiNowMins(now) + 30) e.push({ field: 'start_time', message: 'Book at least 30 minutes ahead of the start time' })
  else {
    const c = sameDay.find(b => b.id !== excludeId && b.date === i.date && ACTIVE.includes(b.status) && start < endMins(b) && end > t2m(b.start_time))
    if (c) e.push({ field: 'start_time', message: `Driver is already booked ${fmtTime(c.start_time)} – ${fmtMins(endMins(c))} (${c.area}). Choose another time.` })
  }
  return e
}
