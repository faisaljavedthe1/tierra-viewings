import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import type { Status } from '../lib/types'
import { BookingCard } from '../components/BookingCard'
import { Chips, Empty } from '../components/ui'

type F = 'all' | Status
const OPTS: { v: F; l: string }[] = [
  { v: 'all', l: 'All' }, { v: 'pending', l: 'Pending' }, { v: 'confirmed', l: 'Confirmed' },
  { v: 'rescheduled', l: 'Rescheduled' }, { v: 'completed', l: 'Completed' }, { v: 'cancelled', l: 'Cancelled' },
]

export function Mine() {
  const { bookings, me } = useData()
  const [f, setF] = useState<F>('all')
  const list = useMemo(() => bookings.filter(b => b.agent_id === me?.id && (f === 'all' || b.status === f))
    .sort((a, z) => z.date.localeCompare(a.date) || z.start_time.localeCompare(a.start_time)), [bookings, me, f])
  return (
    <div className="page-in space-y-4">
      <h1 className="text-2xl font-extrabold">My bookings</h1>
      <Chips value={f} options={OPTS} onChange={setF} />
      {list.length ? <div className="space-y-3">{list.map(b => <BookingCard key={b.id} b={b} showDate />)}</div>
        : <Empty icon="📭" title="No bookings here" text="Your viewing requests appear here." />}
    </div>
  )
}
