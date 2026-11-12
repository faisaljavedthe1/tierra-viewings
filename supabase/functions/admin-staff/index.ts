// Admin-only staff management: create logins and reset passwords.
// Runs on Supabase Edge Functions (free tier). The service key never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
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
  if (password.length < 8 || password.length > 72) return reply(h, 400, { error: 'Password must be 8–72 characters' })

  if (body.action === 'create') {
    const email = str('email', 254).toLowerCase(), full_name = str('full_name', 80), role = str('role', 10)
    const department = str('department', 80) || null, phone = str('phone', 20) || null
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(h, 400, { error: 'Enter a valid email' })
    if (!full_name) return reply(h, 400, { error: 'Enter the full name' })
    if (!ROLES.includes(role)) return reply(h, 400, { error: 'Pick a role' })
    if (phone && !/^\+[0-9]{8,15}$/.test(phone)) return reply(h, 400, { error: 'Phone must look like +971501234567' })
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
    if (error) return reply(h, 400, { error: error.message })
    const { error: e2 } = await admin.from('profiles').update({ full_name, role, department, phone, active: true }).eq('id', data.user.id)
    if (e2) return reply(h, 500, { error: e2.message })
    return reply(h, 200, { id: data.user.id })
  }

  if (body.action === 'reset_password') {
    const id = str('user_id', 36)
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return reply(h, 400, { error: error.message })
    return reply(h, 200, { ok: true })
  }

  return reply(h, 400, { error: 'Unknown action' })
})
