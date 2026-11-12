import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { addDays, dubaiToday, fmtDate, isSunday, WE, WS } from '../lib/time'
import { BookingCard } from '../components/BookingCard'
import { Button, Empty, Stat, useToast } from '../components/ui'

export function Driver() {
  const { bookings } = useData()
  const [day, setDay] = useState(dubaiToday())
  const trips = useMemo(() => bookings.filter(b => b.date === day && (b.status === 'confirmed' || b.status === 'completed'))
    .sort((a, z) => a.start_time.localeCompare(z.start_time)), [bookings, day])
  const mins = trips.reduce((s, b) => s + b.duration_mins, 0)
  return (
    <div className="page-in space-y-4">
      <h1 className="text-2xl font-extrabold">My trips</h1>
      <LocationShare />
      <div className="card flex items-center justify-between p-2">
        <button aria-label="Previous day" className="rounded-lg px-4 py-2 text-lg" onClick={() => setDay(addDays(day, -1))}>‹</button>
        <button className="font-bold" onClick={() => setDay(dubaiToday())}>{fmtDate(day)}</button>
        <button aria-label="Next day" className="rounded-lg px-4 py-2 text-lg" onClick={() => setDay(addDays(day, 1))}>›</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Trips" value={trips.length} /><Stat label="Booked" value={`${(mins / 60).toFixed(1)}h`} /><Stat label="Free" value={`${(Math.max(0, WE - WS - mins) / 60).toFixed(1)}h`} />
      </div>
      {isSunday(day) ? <Empty icon="🌙" title="Sunday — day off" />
        : trips.length ? <div className="space-y-3">{trips.map(b => <BookingCard key={b.id} b={b} />)}</div>
        : <Empty icon="✅" title="No confirmed trips" text="Trips appear here once a manager confirms them." />}
    </div>
  )
}

/** Shares GPS while switched on (at most every 20 s). Turning it off removes the location from the server. */
function LocationShare() {
  const toast = useToast()
  const [on, setOn] = useState(() => { try { return localStorage.getItem('tv-share') === '1' } catch { return false } })
  const [last, setLast] = useState<number | null>(null)
  const watch = useRef<number | null>(null); const sentAt = useRef(0)

  useEffect(() => {
    try { localStorage.setItem('tv-share', on ? '1' : '0') } catch { /* private mode */ }
    if (!on) return
    if (!('geolocation' in navigator)) { toast('This phone cannot share location', 'err'); setOn(false); return }
    watch.current = navigator.geolocation.watchPosition(p => {
      if (Date.now() - sentAt.current < 20_000) return
      sentAt.current = Date.now()
      api.shareLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy).then(() => setLast(Date.now())).catch(e => toast((e as Error).message, 'err'))
    }, e => { toast(e.code === 1 ? 'Location permission denied — allow it in your browser settings' : 'Could not get location', 'err'); if (e.code === 1) setOn(false) },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 })
    return () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current) }
  }, [on, toast])

  return (
    <div className={`card flex items-center justify-between gap-3 p-4 ${on ? 'ring-2 ring-emerald-500/40' : ''}`}>
      <div>
        <div className="font-bold">{on ? '🟢 Sharing live location' : '📍 Location sharing off'}</div>
        <div className="text-xs text-fg2">{on ? (last ? `Last sent ${new Date(last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for GPS…') : 'Managers can see you on the map while this is on.'}</div>
      </div>
      <Button variant={on ? 'ghost' : 'gold'} onClick={() => { if (on) void api.clearLocation(); setOn(!on) }}>{on ? 'Stop' : 'Start'}</Button>
    </div>
  )
}
