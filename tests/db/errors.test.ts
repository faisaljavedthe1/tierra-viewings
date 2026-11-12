// Error tracking: the app reports crashes into the database (free, no third-party account).
import { beforeEach, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'

let db: Db
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.admin, 'Faisal Javed', 'admin')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
}, 30_000)

it('signed-in staff can report errors; only the admin can read them', async () => {
  await db.as(U.agent, `select public.log_client_error('TypeError: x is undefined', 'at foo', '/calendar', 'Chrome 130')`)
  expect(await db.as(U.agent, 'select * from public.client_errors')).toHaveLength(0)
  const [e] = await db.as<{ message: string; user_id: string }>(U.admin, 'select message, user_id from public.client_errors')
  expect(e).toEqual({ message: 'TypeError: x is undefined', user_id: U.agent })
})

it('anonymous visitors cannot report or read errors', async () => {
  await expect(db.as(null, `select public.log_client_error('x', null, null, null)`)).rejects.toThrow(/permission denied/)
  await expect(db.as(null, 'select * from public.client_errors')).rejects.toThrow(/permission denied/)
})

it('long reports are truncated and floods are capped at 30 per user per hour', async () => {
  await db.as(U.agent, `select public.log_client_error($1, $1, $1, $1)`, ['x'.repeat(50_000)])
  const [r] = await db.pg.query<{ m: number; s: number }>('select length(message) m, length(stack) s from public.client_errors').then(r => r.rows)
  expect(r).toEqual({ m: 1000, s: 4000 })
  for (let i = 0; i < 40; i++) await db.as(U.agent, `select public.log_client_error('boom', null, null, null)`)
  const [c] = await db.pg.query<{ n: number }>('select count(*)::int n from public.client_errors').then(r => r.rows)
  expect(c.n).toBe(30)
})
