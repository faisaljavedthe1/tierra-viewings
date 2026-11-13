import { useEffect, useState } from 'react'
import { disablePush, enablePush, isIosBrowserTab, pushIsOn, pushSupported, testPush } from '../lib/push'
import { Button, useToast } from './ui'

/** Account → Phone notifications: on/off for this device, plus a test. */
export function PushCard() {
  const toast = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void pushIsOn().then(setOn) }, [])
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try { await fn(); toast(ok, 'ok'); setOn(await pushIsOn()) } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-bold">Phone notifications</h2>
      <p className="text-sm text-fg2">Alerts for new bookings, confirmations, cancellations, and reminders 1 hour and 15 minutes before each trip — even when the app is closed.</p>
      {!pushSupported() ? (
        <p className="text-sm text-fg2">{isIosBrowserTab() ? 'On iPhone: tap Share → "Add to Home Screen", open Viewings from your Home Screen, then turn this on.' : 'This browser cannot show notifications.'}</p>
      ) : on ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">✓ On for this device</span>
          <Button size="sm" variant="ghost" busy={busy} onClick={() => run(testPush, 'Test sent — it should arrive in a few seconds')}>Send a test</Button>
          <Button size="sm" variant="danger" busy={busy} onClick={() => run(disablePush, 'Notifications turned off for this device')}>Turn off</Button>
        </div>
      ) : (
        <Button size="sm" busy={busy || on === null} onClick={() => run(enablePush, 'Notifications are on for this device')}>Turn on</Button>
      )}
    </div>
  )
}

/** One-time nudge after sign-in, until the person turns notifications on or says "Later". */
export function PushNudge() {
  const toast = useToast()
  const [show, setShow] = useState(false)
  useEffect(() => {
    let hide = false
    try { hide = localStorage.getItem('tv-push-nudge') === 'later' } catch { /* private mode */ }
    if (!hide && pushSupported() && Notification.permission === 'default') setShow(true)
  }, [])
  if (!show) return null
  const later = () => { try { localStorage.setItem('tv-push-nudge', 'later') } catch { /* ignore */ } setShow(false) }
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
      <span className="text-xl" aria-hidden>🔔</span>
      <p className="min-w-40 flex-1 text-sm"><b>Get alerts on your phone</b> — confirmations, changes and trip reminders.</p>
      <Button size="sm" onClick={async () => { try { await enablePush(); toast('Notifications are on', 'ok'); setShow(false) } catch (e) { toast((e as Error).message, 'err') } }}>Turn on</Button>
      <Button size="sm" variant="ghost" onClick={later}>Later</Button>
    </div>
  )
}
