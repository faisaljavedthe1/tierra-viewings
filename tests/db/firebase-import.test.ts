// The Firebase → Supabase import: unit checks on the mapping, then a real load into the database.
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS script
import { toRow, toSql } from '../../scripts/firebase-import.mjs'
import { makeDb, U } from './harness'

const sample = {
  bookings: {
    '-A': { agentName: 'Joie', area: 'Downtown Dubai', createdAt: 1792152309982, date: '2026-10-17', duration: 2, location: 'Palm', purpose: '', startTime: '17:00', status: 'Cancelled', cancelledBy: 'Faisal Javed' },
    '-B': { agentName: 'Nabeeha Khial', area: 'Silicon Oasis', createdAt: 1793088679906, date: '2026-10-30', duration: 1, location: 'Bank', notes: 'Collect cheque', purpose: "Rental cheque — it's urgent", startTime: '15:00', status: 'Completed', tripType: 'pickup', pickupLocation: 'Tierra office 2408', originalDate: '2026-10-30', originalTime: '16:00', rescheduledAt: 1793337808838, completedAt: 1793358489425, confirmedAt: 1793337827043 },
    '-C': { area: 'Dubai Marina', createdAt: 1792150544291, date: '2026-10-16', duration: 0.5, location: 'test', purpose: 'test', startTime: '03:00', status: 'Cancelled', clientRef: 'x'.repeat(300) },
  },
}

describe('mapping', () => {
  it('normalises names, durations, trip types and empty fields', () => {
    expect(toRow('-A', sample.bookings['-A'])).toMatchObject({ agent_name: 'Joie Gracia', duration_mins: 120, purpose: '—', status: 'cancelled', cancel_reason: 'Cancelled by Faisal Javed', trip_type: 'direct', pickup_location: null })
    expect(toRow('-B', sample.bookings['-B'])).toMatchObject({ trip_type: 'pickup', pickup_location: 'Tierra office 2408', original_start: '16:00', status: 'completed', notes: 'Collect cheque' })
    expect(toRow('-C', sample.bookings['-C'])).toMatchObject({ agent_name: 'Unknown', duration_mins: 30, start_time: '03:00' })
    expect(toRow('-C', sample.bookings['-C']).client_ref).toHaveLength(120)
  })
})

it('loads into the real schema, keeps history readable and can be run twice safely', async () => {
  const db = await makeDb()
  await db.addUser(U.mgr, 'Nabeeha Khial', 'manager')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  const sql = toSql(sample)
  await db.pg.exec(sql)
  await db.pg.exec(sql) // second run: no duplicates
  const rows = await db.as<{ agent_name: string; purpose: string | null }>(U.mgr, `select agent_name, purpose from public.calendar('2026-01-01')`)
  expect(rows.map(r => r.agent_name)).toEqual(['Unknown', 'Joie Gracia', 'Nabeeha Khial'])
  expect(rows[2].purpose).toBe("Rental cheque — it's urgent")
  expect((await db.as<{ purpose: string | null }>(U.agent, `select purpose from public.calendar('2026-01-01')`))[2].purpose).toBeNull()
  expect((await db.pg.query('select * from public.booking_events')).rows).toHaveLength(0)
}, 30_000)
