import { supabase, friendly } from './supabase'

/** Phone notifications (Web Push). On iPhone they work once the app is added to the Home Screen (iOS 16.4+). */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIosBrowserTab = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone
  && !matchMedia('(display-mode: standalone)').matches

const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))

async function registration() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>(r => setTimeout(() => r(null), 8000))])
  if (!reg) throw new Error('The app is still installing — reload the page and try again.')
  return reg
}

export async function pushIsOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await registration().catch(() => null)
  return Boolean(await reg?.pushManager.getSubscription())
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIosBrowserTab() ? 'On iPhone: tap Share → Add to Home Screen, open the app from there, then turn this on.' : 'This browser cannot show notifications.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked — allow them for this site in your browser settings.')
  const { data: key, error } = await supabase.rpc('push_public_key')
  if (error) throw new Error(friendly(error))
  if (!key) throw new Error('Notifications are not set up on the server yet.')
  const reg = await registration()
  const sub = await subscribe(reg, fromB64u(key as string))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const device = `${/Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'Computer'}`
  const { error: e2 } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: device })
  if (e2) throw new Error(friendly(e2))
}

/** iPhones sometimes refuse the first subscribe after a sign-out; clear any stale subscription and try once more. */
async function subscribe(reg: ServiceWorkerRegistration, key: Uint8Array) {
  const opts = { userVisibleOnly: true, applicationServerKey: key as BufferSource }
  const existing = await reg.pushManager.getSubscription().catch(() => null)
  if (existing) return existing
  try { return await reg.pushManager.subscribe(opts) } catch (first) {
    await (await reg.pushManager.getSubscription().catch(() => null))?.unsubscribe().catch(() => {})
    await new Promise(r => setTimeout(r, 800))
    try { return await reg.pushManager.subscribe(opts) } catch (second) {
      const name = (second as Error).name || (first as Error).name
      throw Object.assign(new Error('Your phone could not switch on notifications. Close the app fully (swipe it away), open it again and tap the button.'), { detail: `${name}: ${(second as Error).message}` })
    }
  }
}

export async function disablePush() {
  const reg = await registration().catch(() => null)
  const sub = await reg?.pushManager.getSubscription()
  if (sub) { await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe() }
}

export async function testPush() {
  const { error } = await supabase.rpc('send_test_push')
  if (error) throw new Error(friendly(error))
}
