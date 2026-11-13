import { useState, type ReactNode } from 'react'
import { ArrowRightLeft, CalendarClock, Check, CheckCheck, CircleDot, FileText, Flag, Hash, History, MapPin, Pencil, StickyNote, User, X, type LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { dubaiToday, endMins, fmtDate, fmtMins, fmtTime } from '../lib/time'
import { isManagerRole, type Booking } from '../lib/types'
import { confirmedMessage, waLink } from '../lib/whatsapp'
import { BookingForm } from './BookingForm'
import { Button, Field, Modal, StatusPill, useToast } from './ui'

const Row = ({ icon: Icon, children, tone = '' }: { icon: LucideIcon; children: ReactNode; tone?: string }) => (
  <div className={`flex gap-2.5 ${tone}`}><Icon className="mt-[3px] h-4 w-4 shrink-0 text-ink3" aria-hidden /><div className="min-w-0 break-words">{children}</div></div>
)

export function BookingCard({ b, showDate, plain }: { b: Booking; showDate?: boolean; plain?: boolean }) {
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
  const actions = open && (mgr || mine || me?.role === 'driver')

  return (
    <article className={`${plain ? '' : 'card p-4'} ${b.status === 'cancelled' ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showDate && <div className="eyebrow">{fmtDate(b.date)}</div>}
          <div className="text-[17px] font-semibold">{fmtTime(b.start_time)} – {fmtMins(endMins(b))}</div>
          <div className="truncate text-ink2">{b.area}</div>
        </div>
        <StatusPill s={b.status} />
      </div>
      <div className="mt-3 space-y-1.5 text-[14.5px]">
        {b.trip_type === 'pickup' && <Row icon={CircleDot}><span className="text-ink3">Pick-up</span> {b.pickup_location}</Row>}
        <Row icon={MapPin}>{b.trip_type === 'pickup' && <span className="text-ink3">To </span>}{b.location}</Row>
        {b.purpose != null && <Row icon={FileText}>{b.purpose}</Row>}
        {b.notes && <Row icon={StickyNote}>{b.notes}</Row>}
        <Row icon={User}>{agentOf(b)}{b.client_ref && <span className="text-ink3"> · <Hash className="inline h-3 w-3" aria-hidden />{b.client_ref}</span>}</Row>
        {b.status === 'rescheduled' && b.original_date && <Row icon={History} tone="text-[var(--s-rescheduled)]">Moved from {fmtDate(b.original_date)} {fmtTime(b.original_start!)}</Row>}
        {b.status === 'cancelled' && <Row icon={X} tone="text-[var(--s-cancelled)]">Cancelled{b.cancelled_by && <> by {nameOf(b.cancelled_by)}</>}{b.cancel_reason && ` — ${b.cancel_reason}`}</Row>}
        {b.confirmed_by && b.status !== 'cancelled' && <Row icon={CheckCheck} tone="text-ink2">Confirmed by {nameOf(b.confirmed_by)}</Row>}
      </div>
      {actions && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {mgr && b.status !== 'confirmed' && <Button size="sm" variant="success" icon={Check} busy={busy} onClick={confirm}>Confirm</Button>}
          {mine && b.status === 'pending' && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setDlg('edit')}>Edit</Button>}
          {mgr && <Button size="sm" variant="secondary" icon={ArrowRightLeft} onClick={() => setDlg('move')}>Reschedule</Button>}
          {(me?.role === 'driver' || mgr) && b.status === 'confirmed' && b.date <= dubaiToday() &&
            <Button size="sm" variant="secondary" icon={Flag} busy={busy} onClick={() => run(() => api.complete(b.id), 'Trip completed')}>Completed</Button>}
          {(mgr || mine) && <Button size="sm" variant="ghost" className="ml-auto text-[var(--s-cancelled)]" onClick={() => setDlg('cancel')}>Cancel</Button>}
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
      <p className="mb-4 text-ink2">{fmtDate(b.date)}, {fmtTime(b.start_time)} · {b.area}</p>
      <Field label="Reason (optional)"><textarea className="input min-h-24" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Keep it</Button>
        <Button variant="danger" busy={busy} onClick={async () => {
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
      <p className="mt-3 flex items-center gap-2 text-sm text-ink2"><CalendarClock className="h-4 w-4" aria-hidden />The agent sees it as Rescheduled until a manager confirms again.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button busy={busy} onClick={async () => {
          setBusy(true)
          try { upsert(await api.reschedule(b.id, date, time)); toast('Rescheduled', 'ok'); onClose() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
        }}>Move booking</Button>
      </div>
    </Modal>
  )
}
