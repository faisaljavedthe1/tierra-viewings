// Compulsory set-up after sign-in: everyone needs phone notifications; the driver also needs location.
import { describe, expect, it } from 'vitest'
import { requiredSteps, isWorkingTime } from '../../src/lib/setup'

const base = { role: 'agent' as const, pushSupported: true, iosTab: false, notifPermission: 'granted' as NotificationPermission, pushOn: true, geoPermission: 'granted' as const }

describe('what must be set up before using the app', () => {
  it('nothing when notifications are on (and location for the driver)', () => {
    expect(requiredSteps(base)).toEqual([])
    expect(requiredSteps({ ...base, role: 'driver' })).toEqual([])
  })
  it('iPhone in a browser tab must install to the Home Screen first', () => {
    expect(requiredSteps({ ...base, iosTab: true, pushSupported: false, pushOn: false })).toEqual(['install-ios'])
  })
  it('browsers that cannot do notifications (e.g. inside WhatsApp) are sent to Chrome/Safari', () => {
    expect(requiredSteps({ ...base, pushSupported: false, pushOn: false })).toEqual(['unsupported'])
  })
  it('notifications: blocked needs settings help; not yet on needs the switch', () => {
    expect(requiredSteps({ ...base, notifPermission: 'denied', pushOn: false })).toEqual(['notif-blocked'])
    expect(requiredSteps({ ...base, notifPermission: 'default', pushOn: false })).toEqual(['notif'])
    expect(requiredSteps({ ...base, notifPermission: 'granted', pushOn: false })).toEqual(['notif'])
  })
  it('only the driver needs location, and notifications come first', () => {
    expect(requiredSteps({ ...base, geoPermission: 'prompt' })).toEqual([])
    expect(requiredSteps({ ...base, role: 'driver', geoPermission: 'prompt' })).toEqual(['location'])
    expect(requiredSteps({ ...base, role: 'driver', geoPermission: 'denied' })).toEqual(['location-blocked'])
    expect(requiredSteps({ ...base, role: 'driver', pushOn: false, geoPermission: 'prompt' })).toEqual(['notif', 'location'])
  })
})

describe('driver location is shared automatically during working hours only', () => {
  const at = (iso: string) => new Date(iso)
  it('Monday–Saturday 9:00 AM – 6:30 PM Dubai time', () => {
    expect(isWorkingTime(at('2026-11-16T05:00:00Z'))).toBe(true)   // Mon 09:00
    expect(isWorkingTime(at('2026-11-16T04:59:00Z'))).toBe(false)  // Mon 08:59
    expect(isWorkingTime(at('2026-11-16T14:29:00Z'))).toBe(true)   // Mon 18:29
    expect(isWorkingTime(at('2026-11-16T14:30:00Z'))).toBe(false)  // Mon 18:30
    expect(isWorkingTime(at('2026-11-21T08:00:00Z'))).toBe(true)   // Sat
    expect(isWorkingTime(at('2026-11-22T08:00:00Z'))).toBe(false)  // Sun
  })
})

describe('notifications that fail for technical reasons do not lock people out', () => {
  it('lets the person continue after two technical failures, but never when they blocked alerts', async () => {
    const { pushCanBeSkipped } = await import('../../src/lib/setup')
    expect(pushCanBeSkipped({ failures: 1, notifPermission: 'granted' })).toBe(false)
    expect(pushCanBeSkipped({ failures: 2, notifPermission: 'granted' })).toBe(true)
    expect(pushCanBeSkipped({ failures: 5, notifPermission: 'denied' })).toBe(false)
    expect(pushCanBeSkipped({ failures: 5, notifPermission: 'default' })).toBe(false)
  })
  it('remembers a skip only for today, so the app asks again tomorrow', async () => {
    const { skipPushToday, pushSkippedToday } = await import('../../src/lib/setup')
    const store = new Map<string, string>()
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage
    expect(pushSkippedToday(new Date('2026-11-13T10:00:00Z'))).toBe(false)
    skipPushToday(new Date('2026-11-13T10:00:00Z'))
    expect(pushSkippedToday(new Date('2026-11-13T19:00:00Z'))).toBe(true)  // 11 PM Dubai, same day
    expect(pushSkippedToday(new Date('2026-11-13T20:30:00Z'))).toBe(false) // 00:30 next day in Dubai
  })
  it('a skipped push step is not required, other steps still are', () => {
    expect(requiredSteps({ ...base, role: 'driver', pushOn: false, notifPermission: 'granted', geoPermission: 'prompt', pushSkipped: true })).toEqual(['location'])
  })
})
