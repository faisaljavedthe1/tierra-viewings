// Web Push without third-party code: RFC 8291 (message encryption, aes128gcm) + RFC 8292 (VAPID).
// Pure WebCrypto, so the same file runs in Supabase Edge Functions (Deno) and in the Node tests.

export interface PushSubscriptionJSON { endpoint: string; keys: { p256dh: string; auth: string } }
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }

type Bytes = Uint8Array<ArrayBuffer>
const enc = new TextEncoder()
export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''; for (const x of u) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const unb64u = (s: string): Bytes => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(t, c => c.charCodeAt(0))
}
const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** Encrypt one message for one browser (RFC 8291). Fresh ephemeral key and salt every time. */
export async function encryptPayload(sub: PushSubscriptionJSON, text: string): Promise<Bytes> {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth)
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Invalid subscription keys')
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256))
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: aes128gcm\0')), 16)
  const nonce = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: nonce\0')), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const padded = concat(enc.encode(text), new Uint8Array([2])) // single, final record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded))
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([65]), asPublic, cipher)
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  return { publicKey: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', k.privateKey) }
}

/** "vapid t=<signed JWT>, k=<public key>" for the push service of this endpoint (valid 12 h). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)) {
  const jwk = { ...keys.privateJwk, key_ops: ['sign'] }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, concat(enc.encode(`${head}.${body}`)))
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`
}

/** Send one notification. Returns the push service's HTTP status (404/410 = phone unsubscribed). */
export async function sendPush(sub: PushSubscriptionJSON, payload: unknown, keys: VapidKeys, subject: string, ttlSec = 3600) {
  const body = await encryptPayload(sub, JSON.stringify(payload))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidAuthorization(sub.endpoint, keys, subject), 'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream', TTL: String(ttlSec), Urgency: 'high' },
    body,
  })
  return res.status
}
