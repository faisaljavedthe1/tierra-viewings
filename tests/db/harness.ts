// Runs the real migrations on PGlite (Postgres compiled to WASM) with a small stand-in for
// Supabase's auth schema and roles, so RLS policies and RPC functions are tested for real.
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))

const SUPABASE_SHIM = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create schema extensions;
`

export type Db = Awaited<ReturnType<typeof makeDb>>

export async function makeDb() {
  const pg = await PGlite.create({ extensions: { btree_gist } })
  await pg.exec(SUPABASE_SHIM)
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
    await pg.exec(readFileSync(MIGRATIONS + f, 'utf8'))

  /** Run SQL as a signed-in user (or anon when uid is null), like PostgREST does. */
  async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
    return pg.transaction(async tx => {
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
        [uid ?? '', uid ? 'authenticated' : 'anon'])
      return (await tx.query<T>(sql, params)).rows
    })
  }

  /** Superuser setup helper: create an auth user + profile. */
  async function addUser(id: string, name: string, role: 'agent' | 'manager' | 'driver' | 'admin', active = true) {
    await pg.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name.replace(/\s/g, '.')}@t.test`])
    await pg.query(`update public.profiles set full_name=$2, role=$3, active=$4, department='Sales Department' where id=$1`,
      [id, name, role, active])
  }

  /** Freeze "now" for the booking rules (Dubai time string, e.g. '2026-11-16 09:00'). */
  async function setNow(dubaiLocal: string) {
    await pg.query(`update public.app_clock set fixed_now = ($1::timestamp at time zone 'Asia/Dubai')`, [dubaiLocal])
  }

  return { pg, as, addUser, setNow }
}

export const U = {
  admin: '00000000-0000-0000-0000-0000000000a1',
  mgr: '00000000-0000-0000-0000-0000000000b1',
  agent: '00000000-0000-0000-0000-0000000000c1',
  agent2: '00000000-0000-0000-0000-0000000000c2',
  driver: '00000000-0000-0000-0000-0000000000d1',
  gone: '00000000-0000-0000-0000-0000000000e1',
}
