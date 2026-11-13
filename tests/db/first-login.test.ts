// New accounts must choose their own password on first sign-in.
import { beforeEach, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'

let db: Db
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.admin, 'Faisal Javed', 'admin')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  await db.addUser(U.agent2, 'Bahaa Khizer', 'agent')
}, 30_000)

it('accounts start without the flag; the admin tools set it; each person can only clear their own', async () => {
  const flag = (id: string) => db.pg.query<{ f: boolean }>('select must_change_password f from public.profiles where id=$1', [id]).then(r => r.rows[0].f)
  expect(await flag(U.agent)).toBe(false)
  await db.pg.query('update public.profiles set must_change_password = true where id = any($1)', [[U.agent, U.agent2]])
  // visible to the person themselves so the app can force the change
  expect(await db.as<{ must_change_password: boolean }>(U.agent, 'select must_change_password from public.profiles where id=$1', [U.agent])).toEqual([{ must_change_password: true }])
  await db.as(U.agent, 'select public.password_changed()')
  expect(await flag(U.agent)).toBe(false)
  expect(await flag(U.agent2)).toBe(true) // untouched
  await expect(db.as(null, 'select public.password_changed()')).rejects.toThrow(/permission denied/)
  await expect(db.as(U.agent, `update public.profiles set must_change_password = false`)).rejects.toThrow(/permission denied/)
})

it('#1 until the new password is set, the server gives no data and accepts no bookings', async () => {
  await db.pg.query('update public.profiles set must_change_password = true where id=$1', [U.agent])
  expect(await db.as(U.agent, `select * from public.calendar('2026-01-01')`)).toHaveLength(0)
  await expect(db.as(U.agent, `select public.book_viewing('{"date":"2030-01-08","start_time":"10:00","duration_hours":1,"area":"x","location":"x","purpose":"x"}'::jsonb)`)).rejects.toThrow(/choose your own password/)
  expect(await db.as(U.agent, 'select id from public.profiles')).toEqual([{ id: U.agent }]) // only themselves
  await db.as(U.agent, 'select public.password_changed()')
  expect((await db.as(U.agent, 'select id from public.profiles')).length).toBe(3)
})

it('job titles are stored separately from app roles and are length-limited', async () => {
  await db.pg.query(`update public.profiles set job_title = 'Accountant' where id = $1`, [U.agent])
  expect((await db.as<{ role: string; job_title: string }>(U.agent2, 'select role, job_title from public.profiles where id=$1', [U.agent]))[0]).toEqual({ role: 'agent', job_title: 'Accountant' })
  await expect(db.pg.query(`update public.profiles set job_title = repeat('x', 81) where id = $1`, [U.agent])).rejects.toThrow(/check/)
  await expect(db.as(U.agent, `update public.profiles set job_title = 'CEO' where id = $1`, [U.agent])).rejects.toThrow(/permission denied/)
})
