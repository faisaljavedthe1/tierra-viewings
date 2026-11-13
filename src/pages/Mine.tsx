import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { useData } from '../lib/data'
import type { Status } from '../lib/types'
import { BookingCard } from '../components/BookingCard'
import { Chips, Empty, PageHead } from '../components/ui'

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
    <div>
      <PageHead eyebrow="Your requests" title="My bookings" />
      <div className="mb-4"><Chips value={f} options={OPTS} onChange={setF} /></div>
      {list.length ? <div className="space-y-3">{list.map(b => <BookingCard key={b.id} b={b} showDate />)}</div>
        : <Empty icon={Inbox} title="No bookings here" text="Your viewing requests and their status appear here." />}
    </div>
  )
}
