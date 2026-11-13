// Converts the Firebase Realtime Database export (v3 app) into SQL for the bookings table.
// Usage: node scripts/firebase-import.mjs export.json > import.sql
import { readFileSync } from 'node:fs'

const NAME_FIX = { joie: 'Joie Gracia', nab: 'Nabeeha Khial', nabeeha: 'Nabeeha Khial', aishwarya: 'Aishwariya' }
const STATUS = { pending: 'pending', confirmed: 'confirmed', rescheduled: 'rescheduled', cancelled: 'cancelled', completed: 'completed' }

const text = (v, max) => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null }
const ts = ms => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null)
const hhmm = v => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null)

/** One Firebase booking → one row for public.bookings (history: agent kept by name, no login link). */
export function toRow(key, b) {
  const raw = text(b.agentName, 80) ?? text(b.createdBy, 80)
  const agent_name = raw ? NAME_FIX[raw.toLowerCase()] ?? raw : 'Unknown'
  const status = STATUS[String(b.status ?? '').toLowerCase()] ?? 'cancelled'
  const mins = Math.min(480, Math.max(30, Math.round((Number(b.duration) || 1) * 2) * 30))
  const trip_type = b.tripType === 'pickup' ? 'pickup' : 'direct'
  let cancel_reason = text(b.cancelReason, 500)
  if (status === 'cancelled' && !cancel_reason && text(b.cancelledBy, 80)) cancel_reason = `Cancelled by ${b.cancelledBy.trim()}`
  return {
    legacy_id: key, agent_name, department: text(b.department, 80), date: b.date, start_time: hhmm(b.startTime) ?? '09:30',
    duration_mins: mins, area: text(b.area, 120) ?? 'Unknown', trip_type,
    pickup_location: trip_type === 'pickup' ? text(b.pickupLocation, 500) : null,
    location: text(b.location, 500) ?? 'Unknown', purpose: text(b.purpose, 1000) ?? '—', notes: text(b.notes, 2000),
    client_ref: text(b.clientRef, 120), status, created_at: ts(b.createdAt) ?? new Date(b.date + 'T00:00:00+04:00').toISOString(),
    confirmed_at: ts(b.confirmedAt), cancelled_at: ts(b.cancelledAt), cancel_reason, rescheduled_at: ts(b.rescheduledAt),
    original_date: b.originalDate && b.rescheduledAt ? b.originalDate : null,
    original_start: b.rescheduledAt ? hhmm(b.originalTime) : null, completed_at: ts(b.completedAt),
  }
}

const lit = v => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

export function toSql(exportJson) {
  const rows = Object.entries(exportJson.bookings ?? {}).map(([k, b]) => toRow(k, b))
  const cols = Object.keys(rows[0])
  return [
    'begin;',
    'alter table public.bookings disable trigger bookings_audit;',
    `insert into public.bookings (${cols.join(', ')}) values`,
    rows.map(r => `  (${cols.map(c => lit(r[c])).join(', ')})`).join(',\n'),
    'on conflict (legacy_id) do nothing;',
    'alter table public.bookings enable trigger bookings_audit;',
    'commit;',
  ].join('\n')
}

if (process.argv[2]) process.stdout.write(toSql(JSON.parse(readFileSync(process.argv[2], 'utf8'))) + '\n')
