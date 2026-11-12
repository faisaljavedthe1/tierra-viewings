// A stand-in for Supabase used by the browser tests: it answers the same HTTP calls the app makes
// (auth, REST tables, RPC functions, the admin-staff function), but runs them on PGlite with the
// real migrations, row level security and booking rules. Only realtime is not emulated.
import type { Page, Route } from '@playwright/test'
import { makeDb, type Db } from '../db/harness'

export const FAKE_URL = 'https://fake.supabase.test'
export const PASSWORD = 'Test-pass-123'

export const STAFF = {
  faisal: { id: '00000000-0000-0000-0000-00000000000a', name: 'Faisal Javed', email: 'faisal@tierra.test', role: 'admin', phone: '+971552730669' },
  nabeeha: { id: '00000000-0000-0000-0000-00000000000b', name: 'Nabeeha Khial', email: 'nabeeha@tierra.test', role: 'manager', phone: '+971508123721' },
  shazia: { id: '00000000-0000-0000-0000-00000000000c', name: 'Shazia Larik', email: 'shazia@tierra.test', role: 'agent', phone: '+971522647579' },
  bahaa: { id: '00000000-0000-0000-0000-00000000000d', name: 'Bahaa Khizer', email: 'bahaa@tierra.test', role: 'agent', phone: '+971561746669' },
  gagan: { id: '00000000-0000-0000-0000-00000000000e', name: 'Gagan Malla', email: 'gagan@tierra.test', role: 'driver', phone: '+971505244024' },
} as const

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (sub: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365 * 10 })}.sig`
const subOf = (auth?: string) => {
  const t = (auth ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
  try { const s = JSON.parse(Buffer.from(t, 'base64url').toString()).sub as string; return s && s !== 'anon' ? s : null } catch { return null }
}

export class FakeSupabase {
  db!: Db
  passwords = new Map<string, { id: string; password: string }>()

  async start(dubaiNow: string) {
    this.db = await makeDb()
    for (const s of Object.values(STAFF)) {
      await this.db.addUser(s.id, s.name, s.role)
      await this.db.pg.query('update auth.users set email=$2 where id=$1', [s.id, s.email])
      await this.db.pg.query('update public.profiles set phone=$2 where id=$1', [s.id, s.phone])
      this.passwords.set(s.email, { id: s.id, password: PASSWORD })
    }
    await this.db.setNow(dubaiNow)
    return this
  }

  private user(id: string) { return { id, aud: 'authenticated', role: 'authenticated', email: [...this.passwords].find(([, v]) => v.id === id)?.[0] } }
  private session(id: string) { return { access_token: jwt(id), token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, refresh_token: 'r-' + id, user: this.user(id) } }

  async attach(page: Page) {
    await page.routeWebSocket(/fake\.supabase\.test/, () => {}) // realtime: accept and stay quiet
    await page.route(`${FAKE_URL}/**`, r => this.handle(r).catch(e => r.fulfill({ status: 500, json: { message: String(e) } })))
  }

  private async handle(route: Route) {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const uid = subOf(req.headers()['authorization'])
    const body = req.postData() ? JSON.parse(req.postData()!) : {}
    const send = (status: number, json?: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: json === undefined ? '' : JSON.stringify(json) })

    // ---- auth
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') return send(200, this.session(String(body.refresh_token).slice(2)))
      const u = this.passwords.get(String(body.email).toLowerCase())
      return u && u.password === body.password ? send(200, this.session(u.id)) : send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' })
    }
    if (path === '/auth/v1/user' && method === 'GET') return uid ? send(200, this.user(uid)) : send(401, { msg: 'JWT expired' })
    if (path === '/auth/v1/user' && method === 'PUT') {
      const e = [...this.passwords].find(([, v]) => v.id === uid)
      if (e && body.password) e[1].password = body.password
      return send(200, this.user(uid!))
    }
    if (path === '/auth/v1/logout') return send(204)

    // ---- edge function
    if (path === '/functions/v1/admin-staff') {
      const [me] = await this.db.as<{ r: string }>(uid, 'select public.my_role() r')
      if (me?.r !== 'admin') return send(403, { error: 'For the admin only' })
      if (body.action === 'create') {
        const id = crypto.randomUUID()
        await this.db.pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`, [id, body.email, body.full_name])
        await this.db.pg.query(`update public.profiles set role=$2, department=$3, phone=nullif($4,''), active=true where id=$1`, [id, body.role, body.department, body.phone])
        this.passwords.set(String(body.email).toLowerCase(), { id, password: body.password })
        return send(200, { id })
      }
      if (body.action === 'reset_password') {
        const e = [...this.passwords].find(([, v]) => v.id === body.user_id); if (e) e[1].password = body.password
        return send(200, { ok: true })
      }
      return send(400, { error: 'Unknown action' })
    }

    // ---- RPC
    const rpc = path.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc) {
      const fn = rpc[1], keys = Object.keys(body)
      const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ')
      const params = keys.map(k => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))
      try {
        const [ret] = await this.db.pg.query<{ t: string }>(`select prorettype::regtype::text t from pg_proc where proname=$1`, [fn]).then(r => r.rows)
        if (ret?.t === 'void') { await this.db.as(uid, `select public.${fn}(${args})`, params); return send(204) }
        const rows = await this.db.as<{ j: unknown }>(uid, `select to_jsonb(r) j from public.${fn}(${args}) r`, params)
        return send(200, rows[0]?.j ?? null)
      } catch (e) { return send(400, { message: (e as Error).message, code: 'P0001' }) }
    }

    // ---- tables (the small subset of PostgREST the app uses)
    const tbl = path.match(/^\/rest\/v1\/(\w+)$/)
    if (tbl && method === 'GET') {
      const where: string[] = [], params: unknown[] = []
      let order = '', limit = ''
      for (const [k, v] of url.searchParams) {
        if (k === 'select') continue
        if (k === 'order') { order = ' order by ' + v.split(',').map(o => { const [c, d] = o.split('.'); return `${c.replace(/\W/g, '')} ${d === 'desc' ? 'desc' : 'asc'}` }).join(', '); continue }
        if (k === 'limit') { limit = ` limit ${Number(v)}`; continue }
        if (k === 'offset') { limit += ` offset ${Number(v)}`; continue }
        const m = v.match(/^(eq|gte|lte|gt|lt)\.(.*)$/)
        if (m) { params.push(m[2]); where.push(`${k.replace(/\W/g, '')}::text ${{ eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<' }[m[1]]} $${params.length}`) }
      }
      const range = req.headers()['range']
      if (range) { const [a, z] = range.split('-').map(Number); limit = ` limit ${z - a + 1} offset ${a}` }
      try {
        const rows = await this.db.as<{ j: unknown }>(uid, `select to_jsonb(t) - 'slot' j from public.${tbl[1].replace(/\W/g, '')} t${where.length ? ' where ' + where.join(' and ') : ''}${order}${limit}`, params)
        return send(200, rows.map(r => r.j), { 'content-range': `0-${rows.length - 1}/*` })
      } catch (e) { return send(403, { message: (e as Error).message, code: '42501' }) }
    }
    return send(404, { message: 'not emulated: ' + method + ' ' + path })
  }
}
