// Integration tests for the database: row level security, roles and booking rules.
// Written before the migrations (TDD). Run: npm run test:db
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'

let db: Db
// Monday 16 Nov 2026, 09:00 Dubai. Tue 17 Nov is a normal day, Sun 22 Nov is a day off.
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.admin, 'Faisal Javed', 'admin')
  await db.addUser(U.mgr, 'Nabeeha Khial', 'manager')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  await db.addUser(U.agent2, 'Bahaa Khizer', 'agent')
  await db.addUser(U.driver, 'Gagan Malla', 'driver')
  await db.addUser(U.gone, 'Left Company', 'agent', false)
  await db.setNow('2026-11-16 09:00')
}, 30_000)

const base = { date: '2026-11-17', start_time: '10:00', duration_hours: 2, area: 'Dubai Marina',
  trip_type: 'direct', location: 'Marina Gate 1', purpose: 'Client viewing — 2BR' }

async function book(uid: string, over: Record<string, unknown> = {}) {
  const [r] = await db.as<{ id: string; status: string; agent_id: string }>(uid,
    `select * from public.book_viewing($1::jsonb)`, [JSON.stringify({ ...base, ...over })])
  return r
}
const rejects = (p: Promise<unknown>, msg: RegExp) => expect(p).rejects.toThrow(msg)

describe('access control (RLS)', () => {
  it('anonymous visitors cannot read anything', async () => {
    await book(U.agent)
    for (const t of ['bookings', 'profiles', 'driver_location', 'booking_events'])
      await rejects(db.as(null, `select * from public.${t}`), /permission denied/)
  })

  it('active staff see the shared calendar and the staff list', async () => {
    await book(U.agent)
    expect(await db.as(U.agent2, 'select id from public.bookings')).toHaveLength(1)
    expect((await db.as(U.agent2, 'select id from public.profiles')).length).toBe(6)
  })

  it('deactivated staff see nothing and cannot book', async () => {
    await book(U.agent)
    expect(await db.as(U.gone, 'select id from public.bookings')).toHaveLength(0)
    await rejects(book(U.gone), /not an active staff member/)
  })

  it('nobody can insert, update or delete bookings directly', async () => {
    const b = await book(U.agent)
    for (const uid of [U.agent, U.mgr, U.admin, U.driver]) {
      await rejects(db.as(uid, `insert into public.bookings (agent_id) values ($1)`, [uid]), /permission denied/)
      await rejects(db.as(uid, `update public.bookings set status='confirmed' where id=$1`, [b.id]), /permission denied/)
      await rejects(db.as(uid, `delete from public.bookings where id=$1`, [b.id]), /permission denied/)
    }
  })

  it('staff cannot promote themselves', async () => {
    await rejects(db.as(U.agent, `update public.profiles set role='admin' where id=$1`, [U.agent]), /permission denied/)
    await rejects(db.as(U.mgr, `select public.admin_update_staff($1, 'admin', true, null, null)`, [U.agent]), /admin only/)
  })

  it('admin can change roles and deactivate staff', async () => {
    await db.as(U.admin, `select public.admin_update_staff($1, 'manager', true, 'Sales Department', '+971501112233')`, [U.agent])
    const [p] = await db.pg.query<{ role: string; phone: string }>(`select role, phone from public.profiles where id=$1`, [U.agent]).then(r => r.rows)
    expect(p).toEqual({ role: 'manager', phone: '+971501112233' })
    await rejects(db.as(U.admin, `select public.admin_update_staff($1, 'agent', false, null, null)`, [U.admin]), /cannot deactivate or demote yourself/)
  })

  it('a brand-new login has no access until the admin activates it', async () => {
    await db.pg.query(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'new@t.test')`)
    const [p] = await db.pg.query<{ role: string; active: boolean }>(`select role, active from public.profiles where id='00000000-0000-0000-0000-0000000000f1'`).then(r => r.rows)
    expect(p).toEqual({ role: 'agent', active: false })
  })

  it('only the driver writes the live location; only managers and the driver can see it', async () => {
    await rejects(db.as(U.agent, `select public.update_driver_location(25.1, 55.2, 10)`), /driver only/)
    await db.as(U.driver, `select public.update_driver_location(25.1, 55.2, 10)`)
    expect(await db.as(U.agent, 'select * from public.driver_location')).toHaveLength(0)
    expect(await db.as(U.mgr, 'select lat from public.driver_location')).toEqual([{ lat: 25.1 }])
    await rejects(db.as(U.driver, `select public.update_driver_location(200, 55.2, 10)`), /invalid coordinates/i)
    await db.as(U.driver, `select public.clear_driver_location()`)
    expect(await db.as(U.mgr, 'select * from public.driver_location')).toHaveLength(0)
  })

  it('test clock cannot be changed by app users', async () => {
    await rejects(db.as(U.admin, `update public.app_clock set fixed_now = now()`), /permission denied/)
  })
})

describe('booking rules', () => {
  it('a valid booking is pending and always belongs to the caller', async () => {
    const b = await book(U.agent, { agent_id: U.agent2, status: 'confirmed' })
    expect(b.status).toBe('pending')
    expect(b.agent_id).toBe(U.agent)
  })

  it('rejects Sundays, past dates and out-of-hours starts', async () => {
    await rejects(book(U.agent, { date: '2026-11-22' }), /Sunday/)
    await rejects(book(U.agent, { date: '2026-11-15' }), /past/)
    await rejects(book(U.agent, { start_time: '09:00' }), /9:30/)
    await rejects(book(U.agent, { start_time: '18:00' }), /6:00 PM/)
    expect((await book(U.agent, { start_time: '09:30', duration_hours: 1 })).status).toBe('pending')
  })

  it('same-day bookings need 30 minutes notice', async () => {
    await rejects(book(U.agent, { date: '2026-11-16', start_time: '09:15' }), /9:30/)
    await db.setNow('2026-11-16 10:00')
    await rejects(book(U.agent, { date: '2026-11-16', start_time: '10:15' }), /30 minutes/)
    expect((await book(U.agent, { date: '2026-11-16', start_time: '10:30' })).status).toBe('pending')
  })

  it('the single driver cannot be double-booked', async () => {
    await book(U.agent) // 10:00–12:00
    await rejects(book(U.agent2, { start_time: '11:00' }), /Driver is already booked/)
    await rejects(book(U.agent2, { start_time: '09:30', duration_hours: 1 }), /Driver is already booked/)
    expect((await book(U.agent2, { start_time: '12:00' })).status).toBe('pending') // back-to-back is fine
  })

  it('a cancelled booking frees the slot', async () => {
    const b = await book(U.agent)
    await db.as(U.agent, `select public.cancel_booking($1, 'client cancelled')`, [b.id])
    expect((await book(U.agent2)).status).toBe('pending')
  })

  it('validates required fields, trip type and sizes', async () => {
    await rejects(book(U.agent, { area: '' }), /Area is required/)
    await rejects(book(U.agent, { location: '  ' }), /Location is required/)
    await rejects(book(U.agent, { purpose: '' }), /Purpose is required/)
    await rejects(book(U.agent, { trip_type: 'pickup' }), /Pick-up point is required/)
    await rejects(book(U.agent, { trip_type: 'helicopter' }), /trip type/)
    await rejects(book(U.agent, { duration_hours: 0 }), /Duration/)
    await rejects(book(U.agent, { duration_hours: 1.25 }), /Duration/)
    await rejects(book(U.agent, { duration_hours: 9 }), /Duration/)
    await rejects(book(U.agent, { purpose: 'x'.repeat(1001) }), /too long/)
    await rejects(book(U.agent, { date: 'not-a-date' }), /invalid/i)
  })
})

describe('status changes', () => {
  it('only managers confirm', async () => {
    const b = await book(U.agent)
    await rejects(db.as(U.agent, `select public.confirm_booking($1)`, [b.id]), /Only managers/)
    await rejects(db.as(U.driver, `select public.confirm_booking($1)`, [b.id]), /Only managers/)
    const [r] = await db.as<{ status: string }>(U.mgr, `select * from public.confirm_booking($1)`, [b.id])
    expect(r.status).toBe('confirmed')
  })

  it('agents cancel only their own bookings; managers cancel any', async () => {
    const b = await book(U.agent)
    await rejects(db.as(U.agent2, `select public.cancel_booking($1, null)`, [b.id]), /only cancel your own/)
    const [r] = await db.as<{ status: string; cancel_reason: string }>(U.mgr, `select * from public.cancel_booking($1, 'driver sick')`, [b.id])
    expect(r).toMatchObject({ status: 'cancelled', cancel_reason: 'driver sick' })
    await rejects(db.as(U.mgr, `select public.cancel_booking($1, null)`, [b.id]), /already cancelled/)
  })

  it('reschedule keeps the original slot, needs re-confirmation and still blocks the new slot', async () => {
    const b = await book(U.agent)
    await db.as(U.mgr, `select public.confirm_booking($1)`, [b.id])
    await rejects(db.as(U.agent, `select public.reschedule_booking($1, '2026-11-18', '14:00')`, [b.id]), /Only managers/)
    const [r] = await db.as<Record<string, string>>(U.mgr, `select status, original_date::text, original_start::text, start_time::text from public.reschedule_booking($1, '2026-11-18', '14:00')`, [b.id])
    expect(r).toEqual({ status: 'rescheduled', original_date: '2026-11-17', original_start: '10:00:00', start_time: '14:00:00' })
    await rejects(book(U.agent2, { date: '2026-11-18', start_time: '15:00' }), /Driver is already booked/)
    await rejects(db.as(U.mgr, `select public.reschedule_booking($1, '2026-11-22', '10:00')`, [b.id]), /Sunday/)
    expect((await db.as<{ status: string }>(U.mgr, `select status from public.confirm_booking($1)`, [b.id]))[0].status).toBe('confirmed')
  })

  it('the driver can only complete confirmed trips that have started', async () => {
    const b = await book(U.agent)
    await rejects(db.as(U.driver, `select public.complete_trip($1)`, [b.id]), /confirmed/)
    await db.as(U.mgr, `select public.confirm_booking($1)`, [b.id])
    await rejects(db.as(U.agent, `select public.complete_trip($1)`, [b.id]), /driver or managers only/)
    await rejects(db.as(U.driver, `select public.complete_trip($1)`, [b.id]), /not started/)
    await db.setNow('2026-11-17 10:05')
    expect((await db.as<{ status: string }>(U.driver, `select status from public.complete_trip($1)`, [b.id]))[0].status).toBe('completed')
  })

  it('agents edit only their own pending bookings', async () => {
    const b = await book(U.agent)
    const [e] = await db.as<{ purpose: string }>(U.agent, `select purpose from public.edit_booking($1, $2::jsonb)`,
      [b.id, JSON.stringify({ ...base, purpose: 'Updated' })])
    expect(e.purpose).toBe('Updated')
    await rejects(db.as(U.agent2, `select public.edit_booking($1, $2::jsonb)`, [b.id, JSON.stringify(base)]), /only edit your own/)
    await db.as(U.mgr, `select public.confirm_booking($1)`, [b.id])
    await rejects(db.as(U.agent, `select public.edit_booking($1, $2::jsonb)`, [b.id, JSON.stringify(base)]), /pending/)
  })

  it('editing re-checks the rules and ignores the booking itself for overlaps', async () => {
    const b = await book(U.agent)
    await db.as(U.agent, `select public.edit_booking($1, $2::jsonb)`, [b.id, JSON.stringify({ ...base, start_time: '11:00' })])
    await rejects(db.as(U.agent, `select public.edit_booking($1, $2::jsonb)`, [b.id, JSON.stringify({ ...base, date: '2026-11-22' })]), /Sunday/)
  })

  it('every change is recorded in the audit log', async () => {
    const b = await book(U.agent)
    await db.as(U.mgr, `select public.confirm_booking($1)`, [b.id])
    await db.as(U.agent, `select public.cancel_booking($1, 'x')`, [b.id])
    const ev = await db.as<{ action: string; actor_id: string }>(U.mgr, `select action, actor_id from public.booking_events where booking_id=$1 order by id`, [b.id])
    expect(ev).toEqual([
      { action: 'created', actor_id: U.agent }, { action: 'confirmed', actor_id: U.mgr }, { action: 'cancelled', actor_id: U.agent },
    ])
    await rejects(db.as(U.admin, `delete from public.booking_events`), /permission denied/)
    expect(await db.as(U.agent, 'select * from public.booking_events')).toHaveLength(0) // managers only
  })
})
