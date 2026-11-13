// Tests for the pen-test fixes (findings 2, 6, 7, 8, 9, 10). Written before migration 0004.
import { beforeEach, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'

let db: Db
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.admin, 'Faisal Javed', 'admin')
  await db.addUser(U.mgr, 'Nabeeha Khial', 'manager')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  await db.addUser(U.driver, 'Gagan Malla', 'driver')
  await db.addUser(U.gone, 'Junk Signup', 'agent', false)
  await db.setNow('2026-11-16 09:00')
}, 30_000)

const base = { date: '2026-11-17', start_time: '11:00', duration_hours: 2, area: 'JVC', trip_type: 'direct', location: 'Bloom', purpose: 'Viewing' }
const book = (uid: string, over = {}) => db.as<{ id: string }>(uid, 'select * from public.book_viewing($1::jsonb)', [JSON.stringify({ ...base, ...over })]).then(r => r[0])

it('#2 inactive or junk accounts cannot write to the error log', async () => {
  await db.as(U.gone, `select public.log_client_error('spam', null, null, null)`)
  expect((await db.pg.query('select * from public.client_errors')).rows).toHaveLength(0)
})

it('#6 a deactivated user learns nothing about booking ids', async () => {
  const b = await book(U.agent)
  await expect(db.as(U.gone, 'select public.edit_booking($1, $2::jsonb)', [b.id, JSON.stringify(base)])).rejects.toThrow(/not an active staff member/)
  await expect(db.as(U.gone, 'select public.edit_booking($1, $2::jsonb)', ['00000000-0000-0000-0000-000000000000', JSON.stringify(base)])).rejects.toThrow(/not an active staff member/)
})

it('#7 bookings at most 6 months ahead', async () => {
  await expect(book(U.agent, { date: '2027-06-01' })).rejects.toThrow(/6 months/)
  expect((await book(U.agent, { date: '2027-05-15' })).id).toBeTruthy()
})

it('#8 clash messages use the same time format as the app', async () => {
  await book(U.agent)
  await expect(book(U.agent, { start_time: '12:00' })).rejects.toThrow(/booked 11:00 AM – 1:00 PM \(JVC\)/)
})

it('#9 invalid phone numbers get a plain message', async () => {
  await expect(db.as(U.admin, `select public.admin_update_staff($1, null, null, null, '0501234')`, [U.agent])).rejects.toThrow(/Phone must look like \+971501234567/)
})

it('#10 locations older than 2 hours are hidden', async () => {
  await db.as(U.driver, 'select public.update_driver_location(25.1, 55.2, 5)')
  expect(await db.as(U.mgr, 'select lat from public.driver_location')).toHaveLength(1)
  await db.pg.query(`update public.driver_location set updated_at = now() - interval '3 hours'`)
  expect(await db.as(U.mgr, 'select lat from public.driver_location')).toHaveLength(0)
})

it('#5 every security-definer or helper function has a fixed search_path', async () => {
  const { rows } = await db.pg.query<{ f: string }>(`select p.proname f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`)
  expect(rows).toEqual([])
})

it('the backup login can read everything but change nothing', async () => {
  await db.pg.exec(`set role backup_reader`)
  try {
    expect((await db.pg.query('select count(*)::int n from public.profiles')).rows[0]).toEqual({ n: 5 })
    await expect(db.pg.query(`update public.profiles set role='admin'`)).rejects.toThrow(/permission denied|read-only/)
  } finally { await db.pg.exec('reset role') }
})
