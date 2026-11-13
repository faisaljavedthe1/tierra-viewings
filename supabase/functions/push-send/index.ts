// Sends phone notifications. Called only by the database (booking trigger, 5-minute reminder tick,
// test button) with a shared secret that lives in public.app_secrets. Free tier: Supabase Edge Functions.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { generateVapidKeys, sendPush, type VapidKeys } from './webpush.ts'
import { pushesFor, reminderFor, type Person, type Push, type PushBooking } from './messages.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SUBJECT = 'mailto:sales@tierraproperties.ae'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
async function secret(name: string) {
  const { data } = await db.from('app_secrets').select('value').eq('name', name).maybeSingle()
  return (data?.value as string | undefined) ?? null
}
/** VAPID keys are created here on first use and stored server-side; the private key never leaves the server. */
async function vapid(): Promise<VapidKeys> {
  const saved = await secret('vapid_private')
  if (saved) return JSON.parse(saved)
  const k = await generateVapidKeys()
  await db.from('app_secrets').upsert([{ name: 'vapid_private', value: JSON.stringify(k) }, { name: 'vapid_public', value: k.publicKey }],
    { onConflict: 'name', ignoreDuplicates: true })
  return JSON.parse((await secret('vapid_private'))!)
}
function dubaiNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]))
  return { today: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) }
}
const COLS = 'id, agent_id, date, start_time, area, location, status, cancelled_by, cancel_reason'

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const expected = await secret('push_secret')
  if (!expected || !sameSecret(req.headers.get('x-push-secret') ?? '', expected)) return json(401, { error: 'Unauthorised' })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json(400, { error: 'Invalid request' }) }

  const keys = await vapid()
  if (body.type === 'init') return json(200, { publicKey: keys.publicKey })

  const { data: ppl } = await db.from('profiles').select('id, full_name, role').eq('active', true).eq('must_change_password', false)
  const people = (ppl ?? []) as Person[]
  const { today, mins } = dubaiNow()
  let pushes: Push[] = []

  if (body.type === 'test' && typeof body.user_id === 'string') {
    pushes = [{ user_id: body.user_id, title: '🔔 Notifications are on', body: 'This phone will get Tierra Viewings alerts.', tag: 'test', url: '/account' }]
  } else if (body.type === 'booking' && typeof body.booking_id === 'string') {
    const { data: b } = await db.from('bookings').select(COLS).eq('id', body.booking_id).maybeSingle()
    if (b) pushes = pushesFor(typeof body.old_status === 'string' ? body.old_status : null, b as PushBooking, people, today)
  } else if (body.type === 'reminders') {
    const { data: list } = await db.from('bookings').select(COLS).eq('date', today).eq('status', 'confirmed')
    for (const b of (list ?? []) as PushBooking[]) {
      const r = reminderFor(b, today, mins, people)
      if (!r) continue
      // Record first, so a reminder is never sent twice even if two ticks overlap.
      const { data: fresh } = await db.from('push_log').upsert(r.users.map(u => ({ booking_id: b.id, user_id: u, kind: r.kind })),
        { onConflict: 'booking_id,user_id,kind', ignoreDuplicates: true }).select('user_id')
      for (const f of fresh ?? []) pushes.push({ user_id: f.user_id as string, title: r.title, body: r.body, tag: `${b.id}:${r.kind}`, url: '/' })
    }
  } else return json(400, { error: 'Unknown type' })

  const active = new Set(people.map(p => p.id))
  if (body.type !== 'test') pushes = pushes.filter(p => active.has(p.user_id))
  if (!pushes.length) return json(200, { sent: 0 })

  const { data: subs } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', [...new Set(pushes.map(p => p.user_id))])
  let sent = 0, removed = 0
  await Promise.all(pushes.flatMap(p => (subs ?? []).filter(s => s.user_id === p.user_id).map(async s => {
    try {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title: p.title, body: p.body, tag: p.tag, url: p.url }, keys, SUBJECT)
      if (status === 404 || status === 410) { await db.from('push_subscriptions').delete().eq('id', s.id); removed++ } // phone unsubscribed
      else if (status < 300) sent++
      else console.error('push failed', status, new URL(s.endpoint).host)
    } catch (e) { console.error('push error', (e as Error).message) }
  })))
  return json(200, { sent, removed })
})
