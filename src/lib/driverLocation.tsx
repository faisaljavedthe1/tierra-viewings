import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { isWorkingTime, rememberGeo } from './setup'
import { reportError } from './errors'

export interface DriverLoc { active: boolean; lastSent: number | null; error: string | null; screenAwake: boolean; sendNow: () => Promise<void> }
const Ctx = createContext<DriverLoc>({ active: false, lastSent: null, error: null, screenAwake: false, sendNow: async () => {} })
export const useDriverLocation = () => useContext(Ctx)

/**
 * The driver's live location is shared automatically while the app is open during working hours
 * (Mon–Sat 9:00 AM – 6:30 PM) and never outside them. The screen is kept awake while sharing, because
 * phones pause websites that are in the background or locked.
 */
export function DriverLocationProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [working, setWorking] = useState(() => isWorkingTime())
  const [state, setState] = useState<Omit<DriverLoc, 'sendNow'>>({ active: false, lastSent: null, error: null, screenAwake: false })
  const sentAt = useRef(0)
  const reported = useRef(new Set<string>())
  const report = (what: string, e: unknown) => { if (!reported.current.has(what)) { reported.current.add(what); reportError(e, `location:${what}`) } }
  const send = (p: GeolocationPosition) => api.shareLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy)
    .then(() => { sentAt.current = Date.now(); setState(s => ({ ...s, lastSent: Date.now(), error: null })) })
    .catch(e => { report('send', e); setState(s => ({ ...s, error: (e as Error).message })); throw e })

  /** A manual "send now" — also the quickest test that everything works. */
  const sendNow = () => new Promise<void>((ok, fail) => navigator.geolocation.getCurrentPosition(
    p => { rememberGeo('ok'); send(p).then(ok, fail) },
    e => { report(`gps-${e.code}`, new Error(e.message || `GPS error ${e.code}`)); fail(new Error(e.code === 1 ? 'Location is blocked for this app — see the steps in Settings.' : 'Could not get a GPS fix — step outside or near a window and try again.')) },
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 }))

  useEffect(() => { const t = setInterval(() => setWorking(isWorkingTime()), 60_000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (!enabled) return
    if (!working) { void api.clearLocation().catch(() => {}); setState(s => ({ ...s, active: false })); return }
    if (!('geolocation' in navigator)) { setState(s => ({ ...s, error: 'This phone cannot share location' })); return }
    setState(s => ({ ...s, active: true, error: null }))
    const id = navigator.geolocation.watchPosition(p => {
      rememberGeo('ok')
      if (Date.now() - sentAt.current < 20_000) return
      sentAt.current = Date.now()
      send(p).catch(() => {})
    }, e => {
      report(`gps-${e.code}`, new Error(e.message || `GPS error ${e.code}`))
      if (e.code === 1) rememberGeo('denied') // the set-up screen will show the fix-it steps
      setState(s => ({ ...s, error: e.code === 1 ? 'Location permission is off — reopen the app to fix it' : 'Waiting for GPS…' }))
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 })

    // Keep the screen on while sharing (phone on its mount, charging).
    let lock: { release: () => Promise<void> } | null = null
    const wake = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        if (wl && document.visibilityState === 'visible') { lock = await wl.request('screen'); setState(s => ({ ...s, screenAwake: true })) }
      } catch { setState(s => ({ ...s, screenAwake: false })) }
    }
    void wake()
    const vis = () => { if (document.visibilityState === 'visible') void wake() }
    document.addEventListener('visibilitychange', vis)
    return () => {
      navigator.geolocation.clearWatch(id)
      document.removeEventListener('visibilitychange', vis)
      void lock?.release().catch(() => {})
    }
  }, [enabled, working])

  return <Ctx.Provider value={{ ...state, sendNow }}>{children}</Ctx.Provider>
}
