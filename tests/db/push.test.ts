// Push subscriptions, server secrets and the trigger that asks the server to send notifications.
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDb, U, type Db } from './harness'
import { readFileSync } from 'node:fs'
const readMigration = (f: string) => readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8')

let db: Db
beforeEach(async () => {
  db = await makeDb()
  await db.addUser(U.admin, 'Faisal Javed', 'admin')
  await db.addUser(U.agent, 'Shazia Larik', 'agent')
  await db.addUser(U.agent2, 'Bahaa Khizer', 'agent')
  await db.addUser(U.gone, 'Left', 'agent', false)
}, 30_000)
const sub = (n = 1) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) })
const save = (uid: string | null, s = sub()) => db.as(uid, 'select public.save_push_subscription($1, $2, $3, $4)', [s.endpoint, s.p256dh, s.auth, 'Chrome on Android'])

describe('subscriptions', () => {
  it('staff save their own phone; it is theirs alone', async () => {
    await save(U.agent)
    expect(await db.as<{ endpoint: string }>(U.agent, 'select endpoint from public.push_subscriptions')).toHaveLength(1)
    expect(await db.as(U.agent2, 'select * from public.push_subscriptions')).toHaveLength(0)
    expect(await db.as(U.admin, 'select * from public.push_subscriptions')).toHaveLength(0) // not even the admin
  })
  it('the same phone signing in as someone else moves to that person', async () => {
    await save(U.agent); await save(U.agent2)
    const { rows } = await db.pg.query<{ user_id: string }>('select user_id from public.push_subscriptions')
    expect(rows).toEqual([{ user_id: U.agent2 }])
  })
  it('turning it off removes only your own', async () => {
    await save(U.agent, sub(1)); await save(U.agent2, sub(2))
    await db.as(U.agent, 'select public.delete_push_subscription($1)', [sub(2).endpoint]) // not hers: no effect
    await db.as(U.agent, 'select public.delete_push_subscription($1)', [sub(1).endpoint])
    expect((await db.pg.query('select * from public.push_subscriptions')).rows).toHaveLength(1)
  })
  it('rejects junk, non-https endpoints, too many devices, inactive and anonymous users', async () => {
    await expect(save(U.agent, { ...sub(), endpoint: 'http://evil.test/x' })).rejects.toThrow(/push address/)
    await expect(save(U.agent, { ...sub(), p256dh: 'x' })).rejects.toThrow(/push key/)
    for (let i = 1; i <= 10; i++) await save(U.agent, sub(i))
    await save(U.agent, sub(11)) // oldest is dropped, still 10
    expect((await db.pg.query(`select count(*)::int n from public.push_subscriptions where user_id=$1`, [U.agent])).rows[0]).toEqual({ n: 10 })
    await expect(save(U.gone)).rejects.toThrow(/not an active staff member/)
    await expect(save(null)).rejects.toThrow(/permission denied/)
    await expect(db.as(U.agent, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://x','y','z')`, [U.agent])).rejects.toThrow(/permission denied/)
  })
})

describe('server secrets', () => {
  it('nobody in the app can read the server secrets; the public key is shareable', async () => {
    await expect(db.as(U.admin, 'select * from public.app_secrets')).rejects.toThrow(/permission denied/)
    await db.pg.query(`insert into public.app_secrets (name, value) values ('vapid_public', 'BPUB') on conflict (name) do update set value = excluded.value`)
    expect(await db.as(U.agent, 'select public.push_public_key() k')).toEqual([{ k: 'BPUB' }])
    const [{ n }] = await db.pg.query<{ n: number }>(`select length(value)::int n from public.app_secrets where name='push_secret'`).then(r => r.rows)
    expect(n).toBe(64) // generated inside the database
  })
})

describe('trigger', () => {
  it('booking changes queue a notification job without failing when pg_net is not installed', async () => {
    await db.setNow('2026-11-16 09:00')
    const [b] = await db.as<{ id: string }>(U.agent, `select * from public.book_viewing('{"date":"2026-11-17","start_time":"10:00","duration_hours":1,"area":"JVC","location":"Bloom","purpose":"x"}'::jsonb)`)
    expect(b.id).toBeTruthy() // trigger ran and skipped quietly (PGlite has no pg_net)
  })
  it('staff can send a test notification to their own phones only; outsiders cannot', async () => {
    await db.as(U.agent, 'select public.send_test_push()')
    await expect(db.as(U.gone, 'select public.send_test_push()')).rejects.toThrow(/not an active staff member/)
    await expect(db.as(null, 'select public.send_test_push()')).rejects.toThrow(/permission denied/)
  })
})

describe('pen-test fixes', () => {
  it('#1 the backup login cannot read server secrets', async () => {
    await db.pg.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='backup_reader') then create role backup_reader; end if; end $$`)
    await db.pg.exec(readMigration('0012_push_hardening.sql'))
    await db.pg.exec('set role backup_reader')
    try { await expect(db.pg.query('select * from public.app_secrets')).rejects.toThrow(/permission denied/) }
    finally { await db.pg.exec('reset role') }
  })
  it('#3 reminder log entries older than 30 days are cleaned up', async () => {
    await db.setNow('2026-11-16 09:00')
    const [b] = await db.as<{ id: string }>(U.agent, `select * from public.book_viewing('{"date":"2026-11-17","start_time":"10:00","duration_hours":1,"area":"JVC","location":"Bloom","purpose":"x"}'::jsonb)`)
    await db.pg.query(`insert into public.push_log (booking_id, user_id, kind, sent_at) values ($1, $2, 'r60', now() - interval '40 days'), ($1, $2, 'r15', now())`, [b.id, U.agent])
    await db.pg.query('select public.push_reminders_tick()')
    expect((await db.pg.query('select kind from public.push_log')).rows).toEqual([{ kind: 'r15' }])
  })
})

describe('who has notifications on (for chasing people who have not set up)', () => {
  it('managers and the admin see device counts per person; agents cannot', async () => {
    await db.addUser(U.mgr, 'Nabeeha Khial', 'manager')
    await save(U.agent, sub(1)); await save(U.agent, sub(2))
    const rows = await db.as<{ user_id: string; devices: number }>(U.mgr, 'select user_id, devices from public.staff_push_status() order by devices desc')
    expect(rows.find(r => r.user_id === U.agent)?.devices).toBe(2)
    expect(rows.find(r => r.user_id === U.agent2)?.devices).toBe(0)
    await expect(db.as(U.agent, 'select * from public.staff_push_status()')).rejects.toThrow(/managers only/)
  })
})

describe('driver location after hours', () => {
  it('#1 the 5-minute tick wipes the driver location outside working hours (Mon–Sat 9:00–18:30 Dubai)', async () => {
    await db.addUser(U.driver, 'Gagan Malla', 'driver')
    await db.as(U.driver, 'select public.update_driver_location(25.1, 55.2, 10)')
    await db.setNow('2026-11-16 17:00'); await db.pg.query('select public.push_reminders_tick()')
    expect((await db.pg.query('select * from public.driver_location')).rows).toHaveLength(1)   // working hours: kept
    await db.setNow('2026-11-16 18:35'); await db.pg.query('select public.push_reminders_tick()')
    expect((await db.pg.query('select * from public.driver_location')).rows).toHaveLength(0)   // after hours: gone
    await db.as(U.driver, 'select public.update_driver_location(25.1, 55.2, 10)')
    await db.setNow('2026-11-22 11:00'); await db.pg.query('select public.push_reminders_tick()')  // Sunday
    expect((await db.pg.query('select * from public.driver_location')).rows).toHaveLength(0)
  })
})
