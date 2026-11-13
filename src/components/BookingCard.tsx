import { useState } from 'react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { dubaiToday, endMins, fmtDate, fmtMins, fmtTime } from '../lib/time'
import { isManagerRole, type Booking } from '../lib/types'
import { confirmedMessage, waLink } from '../lib/whatsapp'
import { BookingForm } from './BookingForm'
import { Button, Field, Modal, StatusPill, useToast } from './ui'

export function BookingCard({ b, showDate }: { b: Booking; showDate?: boolean }) {
  const { me, nameOf, agentOf, byId, upsert } = useData()
  const toast = useToast()
  const [dlg, setDlg] = useState<'cancel' | 'move' | 'edit' | null>(null)
  const [busy, setBusy] = useState(false)
  const mgr = isManagerRole(me?.role), mine = b.agent_id === me?.id
  const open = ['pending', 'confirmed', 'rescheduled'].includes(b.status)

  async function run(fn: () => Promise<Booking>, ok: string) {
    setBusy(true)
    try { const r = await fn(); upsert(r); toast(ok, 'ok'); return r } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  async function confirm() {
    const r = await run(() => api.confirm(b.id), 'Confirmed')
    const agent = byId(b.agent_id)
    const href = r && agent && waLink(agent.phone, confirmedMessage(agent.full_name.split(' ')[0], r, me?.full_name ?? ''))
    if (href) toast(`Let ${agent!.full_name.split(' ')[0]} know`, 'info', { href, label: 'WhatsApp' })
  }

  return (
    <article className={`card p-4 ${b.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[15px] font-medium">
            {showDate && <span className="mr-2 font-sans font-bold">{fmtDate(b.date)}</span>}
            {fmtTime(b.start_time)} – {fmtMins(endMins(b))}
          </div>
          <div className="mt-0.5 truncate font-bold">{b.area}</div>
        </div>
        <StatusPill s={b.status} />
      </div>
      <dl className="mt-2 space-y-0.5 text-sm text-fg2">
        {b.trip_type === 'pickup' && <div>🚗 <b className="text-fg">From</b> {b.pickup_location}</div>}
        <div>📍 {b.trip_type === 'pickup' && <b className="text-fg">To </b>}{b.location}</div>
        {b.purpose != null && <div>📝 {b.purpose}</div>}
        {b.notes && <div>💬 {b.notes}</div>}
        <div>👤 {agentOf(b)}{b.client_ref && <> · Ref {b.client_ref}</>}</div>
        {b.status === 'rescheduled' && b.original_date && <div className="text-violet-600 dark:text-violet-400">↪ Moved from {fmtDate(b.original_date)} {fmtTime(b.original_start!)}</div>}
        {b.status === 'cancelled' && <div className="text-red-600 dark:text-red-400">Cancelled{b.cancelled_by && <> by {nameOf(b.cancelled_by)}</>}{b.cancel_reason && ` — ${b.cancel_reason}`}</div>}
        {b.confirmed_by && b.status !== 'cancelled' && <div>✔ Confirmed by {nameOf(b.confirmed_by)}</div>}
      </dl>
      {open && (mgr || mine || me?.role === 'driver') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mgr && b.status !== 'confirmed' && <Button size="sm" variant="ok" busy={busy} onClick={confirm}>✓ Confirm</Button>}
          {mine && b.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => setDlg('edit')}>Edit</Button>}
          {mgr && <Button size="sm" variant="ghost" onClick={() => setDlg('move')}>Reschedule</Button>}
          {(mgr || mine) && <Button size="sm" variant="danger" onClick={() => setDlg('cancel')}>Cancel</Button>}
          {(me?.role === 'driver' || mgr) && b.status === 'confirmed' && b.date <= dubaiToday() &&
            <Button size="sm" variant="ghost" busy={busy} onClick={() => run(() => api.complete(b.id), 'Trip completed')}>🏁 Completed</Button>}
        </div>
      )}
      {dlg === 'cancel' && <CancelDialog b={b} onClose={() => setDlg(null)} />}
      {dlg === 'move' && <RescheduleDialog b={b} onClose={() => setDlg(null)} />}
      {dlg === 'edit' && <BookingForm date={b.date} editing={b} onClose={() => setDlg(null)} onSaved={() => {}} />}
    </article>
  )
}

function CancelDialog({ b, onClose }: { b: Booking; onClose: () => void }) {
  const { upsert } = useData(); const toast = useToast()
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <Modal title="Cancel this booking?" onClose={onClose}>
      <p className="mb-3 text-sm text-fg2">{fmtDate(b.date)} at {fmtTime(b.start_time)} — {b.area}</p>
      <Field label="Reason (optional)"><textarea className="input min-h-20" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Keep it</Button>
        <Button variant="danger" className="flex-1" busy={busy} onClick={async () => {
          setBusy(true)
          try { upsert(await api.cancel(b.id, reason)); toast('Booking cancelled', 'ok'); onClose() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
        }}>Cancel booking</Button>
      </div>
    </Modal>
  )
}

function RescheduleDialog({ b, onClose }: { b: Booking; onClose: () => void }) {
  const { upsert } = useData(); const toast = useToast()
  const [date, setDate] = useState(b.date); const [time, setTime] = useState(b.start_time.slice(0, 5)); const [busy, setBusy] = useState(false)
  return (
    <Modal title="Reschedule" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="New date"><input type="date" className="input" min={dubaiToday()} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="New start"><input type="time" className="input" step={900} value={time} onChange={e => setTime(e.target.value)} /></Field>
      </div>
      <p className="mt-2 text-xs text-fg2">The agent sees it as Rescheduled until a manager confirms again.</p>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Back</Button>
        <Button className="flex-1" busy={busy} onClick={async () => {
          setBusy(true)
          try { upsert(await api.reschedule(b.id, date, time)); toast('Rescheduled', 'ok'); onClose() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
        }}>Move booking</Button>
      </div>
    </Modal>
  )
}
