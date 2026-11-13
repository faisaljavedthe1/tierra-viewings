import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BellRing, Chrome, Copy, MapPin, PlusSquare, Share, ShieldAlert } from 'lucide-react'
import { useData } from '../lib/data'
import { enablePush, isIosBrowserTab, pushIsOn, pushSupported } from '../lib/push'
import { requiredSteps, type GeoPermission, type Step } from '../lib/setup'
import { Button, Mark, useToast } from '../components/ui'

async function geoPermission(): Promise<GeoPermission> {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state } catch { return 'unknown' }
}
const isAndroid = () => /Android/.test(navigator.userAgent)

/** Blocks the app until compulsory set-up is done: notifications for everyone, location for the driver. */
export function useSetup() {
  const { me } = useData()
  const [steps, setSteps] = useState<Step[] | null>(null)
  const check = useCallback(async () => {
    if (!me) return
    setSteps(requiredSteps({
      role: me.role, pushSupported: pushSupported(), iosTab: isIosBrowserTab(),
      notifPermission: typeof Notification === 'undefined' ? 'denied' : Notification.permission,
      pushOn: await pushIsOn(), geoPermission: me.role === 'driver' ? await geoPermission() : 'granted',
    }))
  }, [me])
  useEffect(() => {
    void check()
    const again = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [check])
  return { steps, check }
}

export function SetupGate({ steps, recheck }: { steps: Step[]; recheck: () => Promise<void> }) {
  const { me, signOut } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const step = steps[0]
  const total = steps.length
  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false); await recheck() }
  }
  const askLocation = () => new Promise<void>((ok, fail) => navigator.geolocation.getCurrentPosition(() => ok(),
    e => fail(new Error(e.code === 1 ? 'Location was not allowed — see the steps below.' : 'Could not get your location, try again outside.')), { enableHighAccuracy: true, timeout: 20_000 }))

  const screens: Record<Step, { icon: typeof BellRing; title: string; body: ReactNode; action?: ReactNode }> = {
    'install-ios': {
      icon: PlusSquare, title: 'Add Viewings to your Home Screen',
      body: <>
        <p>On iPhone, alerts only work from the Home Screen app.</p>
        <ol className="mt-4 space-y-3 text-left">
          <Li n={1}>Tap the <Share className="inline h-4 w-4 align-[-2px]" aria-label="Share" /> <b>Share</b> button at the bottom of Safari.</Li>
          <Li n={2}>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</Li>
          <Li n={3}>Open <b>Viewings</b> from your Home Screen and sign in again.</Li>
        </ol>
      </>,
    },
    unsupported: {
      icon: Chrome, title: 'Open in Chrome or Safari',
      body: <p>This browser can't show alerts (links opened inside WhatsApp often can't). Open the link in {isAndroid() ? 'Chrome' : 'Safari'} instead.</p>,
      action: <Button variant="secondary" icon={Copy} className="w-full" onClick={() => navigator.clipboard.writeText(location.origin).then(() => toast('Link copied — paste it in your browser', 'ok'), () => toast(location.origin, 'info'))}>Copy app link</Button>,
    },
    notif: {
      icon: BellRing, title: 'Turn on notifications',
      body: <p>{me?.role === 'driver' ? 'You will be told about new trips, changes and reminders before each trip.' : 'You will be told when your viewings are confirmed, moved or cancelled, and reminded before each one.'} This is required to use the app.</p>,
      action: <Button size="lg" className="w-full" busy={busy} onClick={() => go(enablePush)}>Turn on notifications</Button>,
    },
    'notif-blocked': {
      icon: ShieldAlert, title: 'Notifications are blocked',
      body: <>
        <p>Your phone is blocking alerts from this app. Please allow them:</p>
        <ol className="mt-4 space-y-3 text-left">
          {isAndroid()
            ? <><Li n={1}>Tap the <b>⋮ menu</b> (or the icon left of the address) → <b>Site settings</b>.</Li><Li n={2}>Tap <b>Notifications</b> → <b>Allow</b>.</Li><Li n={3}>Come back here and tap <b>Check again</b>.</Li></>
            : <><Li n={1}>Open the iPhone <b>Settings</b> app → <b>Notifications</b>.</Li><Li n={2}>Find <b>Viewings</b> and turn on <b>Allow Notifications</b>.</Li><Li n={3}>Come back here and tap <b>Check again</b>.</Li></>}
        </ol>
      </>,
      action: <Button size="lg" className="w-full" busy={busy} onClick={() => go(async () => {})}>Check again</Button>,
    },
    location: {
      icon: MapPin, title: 'Allow your location',
      body: <p>During working hours (Mon–Sat, 9:00 AM – 6:30 PM) your live location is shared with the managers so they can plan trips. It is never shared outside working hours.</p>,
      action: <Button size="lg" className="w-full" busy={busy} onClick={() => go(askLocation)}>Allow location</Button>,
    },
    'location-blocked': {
      icon: ShieldAlert, title: 'Location is blocked',
      body: <>
        <p>Please allow location for this app:</p>
        <ol className="mt-4 space-y-3 text-left">
          {isAndroid()
            ? <><Li n={1}>Tap the icon left of the address → <b>Permissions</b> → <b>Location</b> → <b>Allow</b>.</Li><Li n={2}>Make sure phone <b>Location</b> is on (swipe down from the top).</Li></>
            : <><Li n={1}>Open <b>Settings</b> → <b>Privacy &amp; Security</b> → <b>Location Services</b> (on).</Li><Li n={2}>Find <b>Safari Websites</b> → <b>While Using the App</b>.</Li></>}
          <Li n={3}>Come back here and tap <b>Check again</b>.</Li>
        </ol>
      </>,
      action: <Button size="lg" className="w-full" busy={busy} onClick={() => go(async () => {})}>Check again</Button>,
    },
  }
  const s = screens[step]
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-paper px-5 py-10">
      <div className="page-in w-full max-w-sm">
        <Mark className="mx-auto mb-8 h-10 w-auto" />
        <div className="card p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"><s.icon className="h-7 w-7" aria-hidden /></div>
          {total > 1 && <div className="eyebrow mb-1">Step 1 of {total}</div>}
          <h1 className="mb-2 text-xl font-semibold">{s.title}</h1>
          <div className="text-[15px] text-ink2">{s.body}</div>
          {s.action && <div className="mt-6">{s.action}</div>}
        </div>
        <button className="mx-auto mt-6 block text-sm text-ink3 hover:text-ink2" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}

const Li = ({ n, children }: { n: number; children: ReactNode }) => (
  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-on-brand">{n}</span><span>{children}</span></li>
)
