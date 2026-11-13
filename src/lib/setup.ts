import type { Role } from './types'
import { dow, dubaiNowMins, dubaiToday } from './time'

export type Step = 'install-ios' | 'unsupported' | 'notif-blocked' | 'notif' | 'location-blocked' | 'location'
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** Set-up that must be done before the app can be used (Faisal's rule, 13 Nov 2026). */
export function requiredSteps(s: {
  role: Role; pushSupported: boolean; iosTab: boolean; notifPermission: NotificationPermission; pushOn: boolean; geoPermission: GeoPermission
}): Step[] {
  if (s.iosTab) return ['install-ios']
  if (!s.pushSupported) return ['unsupported']
  const steps: Step[] = []
  if (!s.pushOn) steps.push(s.notifPermission === 'denied' ? 'notif-blocked' : 'notif')
  if (s.role === 'driver' && s.geoPermission !== 'granted') steps.push(s.geoPermission === 'denied' ? 'location-blocked' : 'location')
  return steps
}

/** Driver location is shared automatically Mon–Sat 9:00 AM – 6:30 PM (Dubai), never outside those hours. */
export function isWorkingTime(now = new Date()) {
  const m = dubaiNowMins(now)
  return dow(dubaiToday(now)) !== 0 && m >= 9 * 60 && m < 18 * 60 + 30
}
