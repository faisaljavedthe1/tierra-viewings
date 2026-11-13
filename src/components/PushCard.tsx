import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { pushIsOn, testPush } from '../lib/push'
import { Button, useToast } from './ui'

/** Account → Phone notifications (compulsory, so there is no off switch — only a test). */
export function PushCard() {
  const toast = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void pushIsOn().then(setOn) }, [])
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-brand" aria-hidden /><h2 className="font-semibold">Phone notifications</h2></div>
      <p className="text-sm text-ink2">New bookings, confirmations, changes, and reminders 1 hour and 15 minutes before each trip — even when the app is closed.</p>
      <div className="flex flex-wrap items-center gap-2">
        {on && <span className="status st-confirmed">On for this device</span>}
        <Button size="sm" variant="secondary" busy={busy} onClick={async () => {
          setBusy(true)
          try { await testPush(); toast('Test sent — it should arrive in a few seconds', 'ok') } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
        }}>Send a test</Button>
      </div>
    </div>
  )
}
