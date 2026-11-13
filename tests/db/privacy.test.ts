// Faisal's decisions (13 Nov 2026): agents see only time, location and the booking agent on colleagues'
// bookings; every booking must finish by 6:00 PM; old Firebase bookings are kept as history.
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'

let db: Db
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.mgr, 'Nabeeha Khial', 'manager')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  await db.addUser(U.agent2, 'Bahaa Khizer', 'agent')
  await db.addUser(U.driver, 'Gagan Malla', 'driver')
  await db.setNow('2026-11-16 09:00')
}, 30_000)

const base = { date: '2026-11-17', start_time: '10:00', duration_hours: 2, area: 'JVC', trip_type: 'pickup', pickup_location: 'Tierra office',
  location: 'Bloom Towers', purpose: 'Mr Ahmed 0501234567', notes: 'Bring keys', client_ref: 'LEAD-77' }
const book = (uid: string, over = {}) => db.as<{ id: string }>(uid, 'select * from public.book_viewing($1::jsonb)', [JSON.stringify({ ...base, ...over })]).then(r => r[0])
type Row = { agent_id: string; start_time: string; area: string; location: string; pickup_location: string | null; purpose: string | null; notes: string | null; client_ref: string | null; cancel_reason: string | null }
const cal = (uid: string) => db.as<Row>(uid, `select * from public.calendar('2026-11-01')`)

describe('client details are private to the booking agent, managers and the driver', () => {
  it('a colleague sees time, area, location and who booked it — nothing about the client', async () => {
    const b = await book(U.agent)
    await db.as(U.agent, `select public.cancel_booking($1, 'Client Mr Ahmed changed his mind')`, [b.id])
    await book(U.agent, { start_time: '13:00' })
    const rows = await cal(U.agent2)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r).toMatchObject({ agent_id: U.agent, area: 'JVC', location: 'Bloom Towers', pickup_location: 'Tierra office', purpose: null, notes: null, client_ref: null, cancel_reason: null })
    }
  })

  it('the booking agent and managers see everything', async () => {
    await book(U.agent)
    expect((await cal(U.agent))[0]).toMatchObject({ purpose: 'Mr Ahmed 0501234567', notes: 'Bring keys', client_ref: 'LEAD-77' })
    expect((await cal(U.mgr))[0]).toMatchObject({ purpose: 'Mr Ahmed 0501234567', client_ref: 'LEAD-77' })
  })

  it('the driver sees full details of confirmed trips only', async () => {
    const b = await book(U.agent)
    expect((await cal(U.driver))[0].purpose).toBeNull()
    await db.as(U.mgr, 'select public.confirm_booking($1)', [b.id])
    expect((await cal(U.driver))[0]).toMatchObject({ purpose: 'Mr Ahmed 0501234567', notes: 'Bring keys' })
  })

  it('the raw table cannot be used to get around the masking', async () => {
    await book(U.agent)
    expect(await db.as(U.agent2, 'select purpose from public.bookings')).toHaveLength(0)
    expect(await db.as(U.agent, 'select purpose from public.bookings')).toHaveLength(1) // own booking (live updates)
    expect(await db.as(U.driver, 'select purpose from public.bookings')).toHaveLength(0) // not confirmed yet
    expect(await db.as(U.mgr, 'select purpose from public.bookings')).toHaveLength(1)
  })

  it('error messages do not leak client details either', async () => {
    await book(U.agent)
    await expect(book(U.agent2, { start_time: '11:00' })).rejects.toThrow(/^(?!.*Ahmed).*Driver is already booked 10:00 AM – 12:00 PM \(JVC\)/)
  })

  it('deactivated or anonymous users get nothing from the calendar', async () => {
    await book(U.agent)
    await db.addUser(U.gone, 'Left', 'agent', false)
    expect(await cal(U.gone)).toHaveLength(0)
    await expect(db.as(null, `select * from public.calendar('2026-11-01')`)).rejects.toThrow(/permission denied/)
  })
})

describe('bookings must finish by 6:00 PM', () => {
  it('rejects a booking that would run past 6', async () => {
    await expect(book(U.agent, { date: '2026-11-18', start_time: '16:30', duration_hours: 2 })).rejects.toThrow(/finish by 6:00 PM/)
    expect((await book(U.agent, { date: '2026-11-18', start_time: '16:00', duration_hours: 2 })).id).toBeTruthy()
  })
  it('applies to reschedules too', async () => {
    const b = await book(U.agent)
    await expect(db.as(U.mgr, `select public.reschedule_booking($1, '2026-11-18', '17:00')`, [b.id])).rejects.toThrow(/finish by 6:00 PM/)
  })
})

describe('old Firebase bookings', () => {
  it('can be stored as history without a login, and show the original agent name', async () => {
    await db.pg.query(`insert into public.bookings (legacy_id, agent_id, agent_name, date, start_time, duration_mins, area, location, purpose, status)
      values ('-P4JDV', null, 'Bahaa Khizer', '2026-10-20', '13:00', 120, 'Damac Hills', 'Damac hills 2', 'Client viewings', 'completed')`)
    const [r] = await db.as<{ agent_name: string; purpose: string | null }>(U.mgr, `select agent_name, purpose from public.calendar('2026-10-01')`)
    expect(r).toEqual({ agent_name: 'Bahaa Khizer', purpose: 'Client viewings' })
    expect((await db.as<{ purpose: string | null }>(U.agent, `select purpose from public.calendar('2026-10-01')`))[0].purpose).toBeNull()
  })
  it('new bookings always need a real agent', async () => {
    await expect(db.pg.query(`insert into public.bookings (agent_id, date, start_time, duration_mins, area, location, purpose)
      values (null, '2026-11-17', '10:00', 60, 'x', 'x', 'x')`)).rejects.toThrow(/agent/)
  })
})
