// Admin-only staff management: create logins and reset passwords.
// Runs on Supabase Edge Functions (free tier). The service key never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// The live site is always allowed; extra origins (a custom domain later) can be added via ALLOWED_ORIGINS.
const SITE = 'https://tierra-viewings.faisaljavedthe1.workers.dev'
const ORIGINS = [SITE, ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)]
const ROLES = ['agent', 'manager', 'driver', 'admin']

function cors(origin: string | null) {
  const ok = origin && (ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin))
  return {
    'Access-Control-Allow-Origin': ok ? origin! : ORIGINS[0] ?? '',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
// Readable temporary password, generated on the server: e.g. "Kx7m-Pq2r-Ry9t" (≈ 71 bits).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function tempPassword() {
  const b = crypto.getRandomValues(new Uint32Array(12))
  const c = [...b].map(x => ALPHA[x % ALPHA.length]).join('')
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, PHONE = /^\+[0-9]{8,15}$/

const reply = (h: Record<string, string>, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  const h = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: h })
  if (req.method !== 'POST') return reply(h, 405, { error: 'Method not allowed' })

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(jwt)
  if (!caller?.user) return reply(h, 401, { error: 'Please sign in again' })
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', caller.user.id).single()
  if (me?.role !== 'admin' || !me.active) return reply(h, 403, { error: 'For the admin only' })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return reply(h, 400, { error: 'Invalid request' }) }
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '')
  const password = typeof body.password === 'string' ? body.password : ''
  if (body.action !== 'create_many' && (password.length < 8 || password.length > 72)) return reply(h, 400, { error: 'Password must be 8–72 characters' })

  async function createOne(p: { email: string; full_name: string; role: string; department: string | null; phone: string | null }, pw: string) {
    if (!EMAIL.test(p.email)) return 'Enter a valid email'
    if (!p.full_name) return 'Enter the full name'
    if (!ROLES.includes(p.role)) return 'Pick a role'
    if (p.phone && !PHONE.test(p.phone)) return 'Phone must look like +971501234567'
    const { data, error } = await admin.auth.admin.createUser({ email: p.email, password: pw, email_confirm: true, user_metadata: { full_name: p.full_name } })
    if (error) return /already/i.test(error.message) ? 'This email already has a login' : error.message
    const { error: e2 } = await admin.from('profiles').update({ full_name: p.full_name, role: p.role, department: p.department, phone: p.phone, active: true, must_change_password: true }).eq('id', data.user.id)
    return e2 ? e2.message : null
  }

  if (body.action === 'create_many') {
    const list = Array.isArray(body.people) ? body.people.slice(0, 50) : []
    if (!list.length) return reply(h, 400, { error: 'Nobody to add' })
    const results = []
    for (const raw of list as Record<string, unknown>[]) {
      const s2 = (k: string, max: number) => (typeof raw[k] === 'string' ? (raw[k] as string).trim().slice(0, max) : '')
      const p = { email: s2('email', 254).toLowerCase(), full_name: s2('full_name', 80), role: s2('role', 10) || 'agent', department: s2('department', 80) || null, phone: s2('phone', 20) || null }
      const pw = tempPassword()
      const err = await createOne(p, pw)
      results.push(err ? { email: p.email, full_name: p.full_name, ok: false, error: err } : { email: p.email, full_name: p.full_name, ok: true, password: pw })
    }
    return reply(h, 200, { results })
  }

  if (body.action === 'create') {
    const err = await createOne({ email: str('email', 254).toLowerCase(), full_name: str('full_name', 80), role: str('role', 10),
      department: str('department', 80) || null, phone: str('phone', 20) || null }, password)
    return err ? reply(h, 400, { error: err }) : reply(h, 200, { ok: true })
  }

  if (body.action === 'reset_password') {
    const id = str('user_id', 36)
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return reply(h, 400, { error: error.message })
    await admin.from('profiles').update({ must_change_password: true }).eq('id', id)
    return reply(h, 200, { ok: true })
  }

  return reply(h, 400, { error: 'Unknown action' })
})
