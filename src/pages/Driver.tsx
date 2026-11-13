import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Moon, Sun } from 'lucide-react'
import { useData } from '../lib/data'
import { useDriverLocation } from '../lib/driverLocation'
import { addDays, dubaiToday, fmtDate, isSunday, WE, WS } from '../lib/time'
import { BookingCard } from '../components/BookingCard'
import { Empty, PageHead, Stat } from '../components/ui'

export function Driver() {
  const { bookings } = useData()
  const [day, setDay] = useState(dubaiToday())
  const trips = useMemo(() => bookings.filter(b => b.date === day && (b.status === 'confirmed' || b.status === 'completed'))
    .sort((a, z) => a.start_time.localeCompare(z.start_time)), [bookings, day])
  const mins = trips.reduce((s, b) => s + b.duration_mins, 0)
  return (
    <div className="space-y-4">
      <PageHead eyebrow="Driver" title="My trips" />
      <LocationStatus />
      <div className="card flex items-center justify-between p-1.5">
        <button aria-label="Previous day" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-paper2" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-5 w-5" /></button>
        <button className="font-semibold" onClick={() => setDay(dubaiToday())}>{fmtDate(day)}</button>
        <button aria-label="Next day" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-paper2" onClick={() => setDay(addDays(day, 1))}><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Trips" value={trips.length} /><Stat label="Booked" value={`${(mins / 60).toFixed(1)}h`} /><Stat label="Free" value={`${(Math.max(0, WE - WS - mins) / 60).toFixed(1)}h`} />
      </div>
      {isSunday(day) ? <Empty icon={Moon} title="Sunday — day off" />
        : trips.length ? <div className="space-y-3">{trips.map(b => <BookingCard key={b.id} b={b} />)}</div>
        : <Empty icon={CheckCircle2} title="No confirmed trips" text="Trips appear here once a manager confirms them." />}
    </div>
  )
}

/** Location is shared automatically during working hours — nothing for the driver to switch on or off. */
function LocationStatus() {
  const { active, lastSent, error, screenAwake } = useDriverLocation()
  const ago = lastSent ? new Date(lastSent).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div className={`card flex items-start gap-3 p-4 ${active && !error ? 'ring-1 ring-[var(--s-confirmed)]/40' : ''}`}>
      <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[var(--s-confirmed-bg)] text-[var(--s-confirmed)]' : 'bg-paper2 text-ink3'}`}>
        {active ? <MapPin className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
      </span>
      <div className="min-w-0">
        <div className="font-semibold">{active ? 'Sharing live location' : 'Location off — outside working hours'}</div>
        <div className="text-sm text-ink2">
          {active ? (error ?? (ago ? `Last sent at ${ago}` : 'Waiting for GPS…')) : 'Shared automatically Mon–Sat, 9:00 AM – 6:30 PM.'}
        </div>
        {active && <div className="mt-1 flex items-center gap-1.5 text-xs text-ink3"><Sun className="h-3.5 w-3.5" aria-hidden />{screenAwake ? 'Screen kept on — keep the phone on its mount and charging.' : 'Keep this app open on screen while driving.'}</div>}
      </div>
    </div>
  )
}
