// Web Push encryption (RFC 8291) and VAPID (RFC 8292), checked against an independent implementation
// (http_ece, the library the standard `web-push` package uses) acting as the phone.
import { createECDH, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error no types
import ece from 'http_ece'
import { b64u, encryptPayload, generateVapidKeys, vapidAuthorization } from '../../supabase/functions/push-send/webpush'

function phone() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const auth = randomBytes(16)
  return { ecdh, auth, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } }
}

describe('payload encryption', () => {
  it('the phone can decrypt what we send', async () => {
    const p = phone()
    const body = await encryptPayload(p.sub, JSON.stringify({ title: 'Viewing confirmed', body: 'Tomorrow 10:00 AM — JVC' }))
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: p.ecdh, authSecret: p.auth })
    expect(JSON.parse(plain.toString())).toEqual({ title: 'Viewing confirmed', body: 'Tomorrow 10:00 AM — JVC' })
  })
  it('every message uses fresh keys and salt (two sends never look alike)', async () => {
    const p = phone()
    const a = await encryptPayload(p.sub, 'same'), b = await encryptPayload(p.sub, 'same')
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
  it('another phone cannot decrypt it', async () => {
    const p = phone(), q = phone()
    const body = await encryptPayload(p.sub, 'secret')
    expect(() => ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: q.ecdh, authSecret: q.auth })).toThrow()
  })
})

describe('VAPID (proves the message comes from our server)', () => {
  it('signs a short-lived token for the push service, verifiable with our public key', async () => {
    const keys = await generateVapidKeys()
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:sales@tierraproperties.ae', 1_800_000_000)
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(k).toBe(keys.publicKey)
    const [h, p, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:sales@tierraproperties.ae' })
    const pub = await crypto.subtle.importKey('raw', Buffer.from(keys.publicKey, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`))
    expect(ok).toBe(true)
  })
  it('the private key round-trips through storage as JSON', async () => {
    const keys = await generateVapidKeys()
    expect(JSON.parse(JSON.stringify(keys)).privateJwk.d).toBeTruthy()
    expect(Buffer.from(keys.publicKey, 'base64url')).toHaveLength(65)
  })
})
