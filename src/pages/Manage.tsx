import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { useData } from '../lib/data'
import { driverReport } from '../lib/report'
import { addDays, dubaiToday, endMins, fmtDate, fmtMins, fmtTime, monday } from '../lib/time'
import { BookingCard } from '../components/BookingCard'
import { DriverMap } from '../components/DriverMap'
import { BarChart3, CheckCircle2, Download, Map as MapIcon, Search } from 'lucide-react'
import { Button, Chips, Empty, Modal, PageHead, Stat, STATUS_LABEL, useToast } from '../components/ui'

type F = 'pending' | 'upcoming' | 'today' | 'all' | 'cancelled'

export function Manage() {
  const { bookings, nameOf, agentOf } = useData()
  const toast = useToast()
  const today = dubaiToday()
  const [f, setF] = useState<F>('pending')
  const [q, setQ] = useState('')
  const [map, setMap] = useState(false)
  const [report, setReport] = useState(false)
  const [busy, setBusy] = useState(false)

  const pending = bookings.filter(b => b.status === 'pending' || b.status === 'rescheduled')
  const todays = bookings.filter(b => b.date === today && (b.status === 'confirmed' || b.status === 'completed'))
  const wk = monday(today)
  const week = bookings.filter(b => b.date >= wk && b.date <= addDays(wk, 5) && b.status !== 'cancelled')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return bookings.filter(b => {
      if (f === 'pending' && !(b.status === 'pending' || b.status === 'rescheduled')) return false
      if (f === 'upcoming' && !(b.date >= today && b.status !== 'cancelled' && b.status !== 'completed')) return false
      if (f === 'today' && b.date !== today) return false
      if (f === 'cancelled' && b.status !== 'cancelled') return false
      return !s || [b.area, b.location, b.purpose, b.client_ref, agentOf(b)].some(x => x?.toLowerCase().includes(s))
    }).sort((a, z) => (f === 'all' || f === 'cancelled' ? -1 : 1) * (a.date.localeCompare(z.date) || a.start_time.localeCompare(z.start_time)))
  }, [bookings, f, q, today, agentOf])

  async function exportAll() {
    setBusy(true)
    try {
      const all = await api.allBookings()
      const ts = (v: string | null) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }) : '')
      downloadCsv(`tierra-viewings-${today}.csv`, [
        ['Date', 'Start', 'End', 'Hours', 'Area', 'Trip type', 'Pick-up', 'Location / destination', 'Purpose', 'Notes', 'Agent', 'Department', 'Status', 'Client ref', 'Cancel reason', 'Booked at', 'Confirmed by', 'Confirmed at'],
        ...all.map(b => [b.date, fmtTime(b.start_time), fmtMins(endMins(b)), b.duration_mins / 60, b.area, b.trip_type, b.pickup_location, b.location, b.purpose, b.notes,
          agentOf(b), b.department, STATUS_LABEL[b.status], b.client_ref, b.cancel_reason, ts(b.created_at), b.confirmed_by ? nameOf(b.confirmed_by) : '', ts(b.confirmed_at)]),
      ])
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Manager" title="Bookings" actions={<>
        <Button size="sm" variant="secondary" icon={MapIcon} onClick={() => setMap(true)}>Driver live</Button>
        <Button size="sm" variant="secondary" icon={BarChart3} onClick={() => setReport(true)}>Report</Button>
        <Button size="sm" variant="secondary" icon={Download} busy={busy} onClick={exportAll}>CSV</Button>
      </>} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="To confirm" value={pending.length} />
        <Stat label="Trips today" value={todays.length} />
        <Stat label="This week" value={week.length} />
      </div>
      <Chips value={f} onChange={setF} options={[{ v: 'pending', l: `Needs confirming (${pending.length})` }, { v: 'today', l: 'Today' }, { v: 'upcoming', l: 'Upcoming' }, { v: 'all', l: 'All' }, { v: 'cancelled', l: 'Cancelled' }]} />
      <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink3" aria-hidden />
        <input className="input pl-10" placeholder="Search agent, area, client…" aria-label="Search bookings" value={q} onChange={e => setQ(e.target.value)} /></div>
      {list.length ? <div className="space-y-3">{list.map(b => <BookingCard key={b.id} b={b} showDate />)}</div>
        : <Empty icon={CheckCircle2} title={f === 'pending' ? 'Nothing waiting' : 'No bookings'} text={f === 'pending' ? 'New requests from agents appear here for confirmation.' : undefined} />}
      {map && <Modal title="Driver live location" wide onClose={() => setMap(false)}><DriverMap /></Modal>}
      {report && <Report onClose={() => setReport(false)} />}
    </div>
  )
}

function Report({ onClose }: { onClose: () => void }) {
  const { bookings } = useData()
  const [days, setDays] = useState<'7' | '14' | '30'>('7')
  const rows = driverReport(bookings, dubaiToday(), Number(days))
  const tot = rows.reduce((s, r) => ({ trips: s.trips + r.trips, booked: s.booked + r.bookedMins, idle: s.idle + r.idleMins }), { trips: 0, booked: 0, idle: 0 })
  const pct = tot.booked + tot.idle ? Math.round((tot.booked / (tot.booked + tot.idle)) * 100) : 0
  return (
    <Modal title="Driver utilisation" wide onClose={onClose}>
      <Chips value={days} onChange={setDays} options={[{ v: '7', l: 'Last 7 days' }, { v: '14', l: '14 days' }, { v: '30', l: '30 days' }]} />
      <div className="my-4 grid grid-cols-3 gap-3">
        <Stat label="Trips" value={tot.trips} /><Stat label="Hours booked" value={(tot.booked / 60).toFixed(1)} /><Stat label="Utilisation" value={`${pct}%`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink3"><tr><th className="py-1">Day</th><th>Trips</th><th>Booked</th><th>Idle</th><th className="w-1/3" /></tr></thead>
          <tbody>
            {rows.slice().reverse().map(r => (
              <tr key={r.date} className="border-t border-line">
                <td className="py-1.5 font-medium">{fmtDate(r.date)}</td><td>{r.trips}</td><td>{(r.bookedMins / 60).toFixed(1)}h</td><td>{(r.idleMins / 60).toFixed(1)}h</td>
                <td><div className="h-2 rounded-full bg-paper2"><div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, (r.bookedMins / 510) * 100)}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
