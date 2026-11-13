import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { AREAS, DRIVER_COORDINATORS, DURATIONS } from '../lib/constants'
import { dubaiToday, validateBooking, type FieldError } from '../lib/time'
import type { Booking, BookingInput } from '../lib/types'
import { newBookingMessage, waLink } from '../lib/whatsapp'
import { Button, Field, Modal, useToast } from './ui'

const blank = (date: string, time = '10:00'): BookingInput => ({
  date, start_time: time, duration_hours: 2, area: '', trip_type: 'direct', pickup_location: '',
  location: '', purpose: '', notes: '', client_ref: '',
})
const fromBooking = (b: Booking): BookingInput => ({
  date: b.date, start_time: b.start_time.slice(0, 5), duration_hours: b.duration_mins / 60, area: b.area, trip_type: b.trip_type,
  pickup_location: b.pickup_location ?? '', location: b.location, purpose: b.purpose ?? '', notes: b.notes ?? '', client_ref: b.client_ref ?? '',
})

export function BookingForm({ date, initialTime, editing, onClose, onSaved }: { date: string; initialTime?: string; editing?: Booking; onClose: () => void; onSaved: (b: Booking) => void }) {
  const { bookings, profiles, me, upsert } = useData()
  const toast = useToast()
  const [f, setF] = useState<BookingInput>(() => (editing ? fromBooking(editing) : blank(date, initialTime)))
  const [other, setOther] = useState(() => (editing && !AREAS.includes(editing.area) ? editing.area : ''))
  const [customDur, setCustomDur] = useState(() => !DURATIONS.includes(f.duration_hours))
  const [errors, setErrors] = useState<FieldError[]>([])
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => { setF(x => ({ ...x, [k]: v })); setErrors(e => e.filter(x => x.field !== k)) }
  const areaSel = AREAS.includes(f.area) ? f.area : f.area || other ? 'other' : ''
  const input = useMemo(() => ({ ...f, area: areaSel === 'other' ? other : f.area }), [f, other, areaSel])
  const err = (k: keyof BookingInput) => errors.find(e => e.field === k)?.message
  // Warn about a clash as soon as date/time/duration are chosen, even before the rest is filled in.
  const liveConflict = useMemo(() => validateBooking({ ...input, area: 'x', location: 'x', purpose: 'x', pickup_location: 'x' }, bookings, new Date(), editing?.id)
    .find(e => e.message.startsWith('Driver')), [input, bookings, editing])

  async function submit() {
    const e = validateBooking(input, bookings, new Date(), editing?.id)
    setErrors(e)
    if (e.length) { toast(e[0].message, 'err'); return }
    setBusy(true)
    try {
      const b = editing ? await api.edit(editing.id, input) : await api.book(input)
      upsert(b); onSaved(b)
      if (!editing) {
        toast('Booking submitted. Tap to let the coordinators know on WhatsApp.', 'ok')
        DRIVER_COORDINATORS.forEach((name, i) => {
          const p = profiles.find(x => x.full_name === name)
          const href = waLink(p?.phone, newBookingMessage(me?.full_name ?? '', b))
          if (href) setTimeout(() => toast(`Notify ${name.split(' ')[0]}`, 'info', { href, label: 'WhatsApp' }), 400 * (i + 1))
        })
      } else toast('Booking updated', 'ok')
      onClose()
    } catch (x) { toast((x as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={editing ? 'Edit booking' : 'Book the driver'} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-bg2 p-1" role="radiogroup" aria-label="Trip type">
        {(['direct', 'pickup'] as const).map(t => (
          <button key={t} role="radio" aria-checked={f.trip_type === t} onClick={() => set('trip_type', t)}
            className={`rounded-lg py-2 text-sm font-semibold ${f.trip_type === t ? 'bg-surface shadow' : 'text-fg2'}`}>
            {t === 'direct' ? '📍 Viewing location' : '🚗 Pick-up + destination'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required error={err('date')}>
          <input type="date" className="input" min={dubaiToday()} value={f.date} aria-invalid={!!err('date')} onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="Start time" required error={err('start_time')}>
          <input type="time" className="input" min="09:30" max="17:30" step={900} value={f.start_time} aria-invalid={!!err('start_time')} onChange={e => set('start_time', e.target.value)} />
        </Field>
        <Field label="Duration" required error={err('duration_hours')}>
          {customDur
            ? <input type="number" className="input" min={0.5} max={8} step={0.5} value={f.duration_hours} onChange={e => set('duration_hours', Number(e.target.value))} />
            : <select className="input" value={f.duration_hours} onChange={e => e.target.value === 'c' ? setCustomDur(true) : set('duration_hours', Number(e.target.value))}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} hour{d > 1 ? 's' : ''}</option>)}
                <option value="c">Custom…</option>
              </select>}
        </Field>
        <Field label="Area" required error={err('area')}>
          <select className="input" value={areaSel} aria-invalid={!!err('area')} onChange={e => { if (e.target.value === 'other') { set('area', ''); setOther(other || ' ') } else { set('area', e.target.value); setOther('') } }}>
            <option value="">Select area…</option>
            {AREAS.map(a => <option key={a}>{a}</option>)}
            <option value="other">Other (type below)</option>
          </select>
        </Field>
        {areaSel === 'other' && (
          <Field label="Specify area" required full>
            <input className="input" maxLength={120} value={other.trimStart()} placeholder="e.g. Yas Island, Abu Dhabi" onChange={e => setOther(e.target.value)} />
          </Field>
        )}
        {f.trip_type === 'pickup' && (
          <Field label="Pick-up point" required full error={err('pickup_location')}>
            <PlaceInput value={f.pickup_location} invalid={!!err('pickup_location')} onChange={v => set('pickup_location', v)} placeholder="Where should the driver collect you?" />
          </Field>
        )}
        <Field label={f.trip_type === 'pickup' ? 'Destination' : 'Location'} required full error={err('location')}>
          <PlaceInput value={f.location} invalid={!!err('location')} onChange={v => set('location', v)} placeholder="Building, tower or address" />
        </Field>
        <Field label="Purpose / client info" required full error={err('purpose')}>
          <textarea className="input min-h-20" maxLength={1000} value={f.purpose} aria-invalid={!!err('purpose')} onChange={e => set('purpose', e.target.value)} placeholder="e.g. 2BR viewing with Mr. Ahmed" />
        </Field>
        <Field label="Client reference">
          <input className="input" maxLength={120} value={f.client_ref} onChange={e => set('client_ref', e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Notes">
          <input className="input" maxLength={2000} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {liveConflict && <p className="mt-3 rounded-xl bg-red-600/10 p-3 text-sm font-medium text-red-700 dark:text-red-400">⚠️ {liveConflict.message}</p>}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-[2]" busy={busy} onClick={submit}>{editing ? 'Save changes' : 'Book viewing'}</Button>
      </div>
    </Modal>
  )
}

/** Free-text address with OpenStreetMap suggestions (UAE only, debounced, no key needed). */
function PlaceInput({ value, onChange, placeholder, invalid }: { value: string; onChange: (v: string) => void; placeholder: string; invalid: boolean }) {
  const [hits, setHits] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const t = useRef<number>(0)
  useEffect(() => () => clearTimeout(t.current), [])
  function type(v: string) {
    onChange(v); clearTimeout(t.current)
    if (v.trim().length < 3) { setHits([]); return }
    t.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ae&q=${encodeURIComponent(v)}`, { headers: { Accept: 'application/json' } })
        const j = (await r.json()) as { display_name: string }[]
        setHits(j.map(x => x.display_name.split(', ').slice(0, 4).join(', '))); setOpen(true)
      } catch { setHits([]) }
    }, 450)
  }
  return (
    <div className="relative">
      <input className="input" maxLength={500} value={value} placeholder={placeholder} aria-invalid={invalid} autoComplete="off"
        onChange={e => type(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => hits.length && setOpen(true)} />
      {open && hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line2 bg-bg shadow-xl">
          {hits.map(h => <li key={h}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-bg2" onMouseDown={() => { onChange(h); setOpen(false) }}>{h}</button></li>)}
        </ul>
      )}
    </div>
  )
}
