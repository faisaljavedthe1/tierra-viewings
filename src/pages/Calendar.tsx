import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { addDays, DAYS, dubaiToday, fmtDate, fmtMins, gaps, isSunday, m2t, monday, MONTHS, t2m, weekDays } from '../lib/time'
import { BookingCard } from '../components/BookingCard'
import { BookingForm } from '../components/BookingForm'
import { Button, Empty } from '../components/ui'

export function Calendar() {
  const { bookings } = useData()
  const today = dubaiToday()
  const [day, setDay] = useState(isSunday(today) ? addDays(today, 1) : today)
  const [form, setForm] = useState<{ date: string; time?: string } | null>(null)
  const week = weekDays(monday(day))
  const dayList = useMemo(() => bookings.filter(b => b.date === day && b.status !== 'cancelled').sort((a, z) => a.start_time.localeCompare(z.start_time)), [bookings, day])
  const count = (d: string) => bookings.filter(b => b.date === d && b.status !== 'cancelled').length
  const items = useMemo(() => [
    ...dayList.map(b => ({ k: b.id, s: t2m(b.start_time), b })),
    ...gaps(dayList).map(g => ({ k: 'g' + g.s, s: g.s, g })),
  ].sort((a, z) => a.s - z.s), [dayList])
  const canBook = day >= today && !isSunday(day)
  const d0 = new Date(week[0] + 'T00:00:00Z')

  return (
    <div className="page-in space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Driver calendar</h1>
        <Button onClick={() => setForm({ date: canBook ? day : today })}>＋ Book</Button>
      </div>
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <button aria-label="Previous week" className="rounded-lg px-3 py-1 text-fg2 hover:bg-bg2" onClick={() => setDay(addDays(week[0], -7))}>‹</button>
          <div className="text-sm font-semibold">{MONTHS[d0.getUTCMonth()]} {d0.getUTCFullYear()} · <button className="text-gold" onClick={() => setDay(isSunday(today) ? addDays(today, 1) : today)}>Today</button></div>
          <button aria-label="Next week" className="rounded-lg px-3 py-1 text-fg2 hover:bg-bg2" onClick={() => setDay(addDays(week[0], 7))}>›</button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {week.map(d => {
            const n = count(d), on = d === day, x = new Date(d + 'T00:00:00Z')
            return (
              <button key={d} onClick={() => setDay(d)} aria-pressed={on}
                className={`flex flex-col items-center rounded-xl py-2 transition ${on ? 'gold-grad text-white shadow' : d === today ? 'bg-gold-soft' : 'hover:bg-bg2'}`}>
                <span className="text-[11px] font-semibold opacity-80">{DAYS[x.getUTCDay()]}</span>
                <span className="text-lg font-extrabold">{x.getUTCDate()}</span>
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${n ? (on ? 'bg-white' : 'bg-gold') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
      </div>
      <h2 className="font-bold text-fg2">{fmtDate(day)} · {dayList.length} booking{dayList.length === 1 ? '' : 's'}</h2>
      {isSunday(day) ? <Empty icon="🌙" title="Sunday — day off" text="No viewings on Sundays." />
        : items.length === 0 ? <Empty icon="🗓️" title="Nothing booked" />
        : <div className="space-y-3">
            {items.map(it => 'b' in it && it.b ? <BookingCard key={it.k} b={it.b} /> : 'g' in it && it.g ? (
              <button key={it.k} disabled={!canBook} onClick={() => setForm({ date: day, time: m2t(it.g.s) })}
                className="flex w-full items-center justify-between rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-left text-sm font-semibold text-emerald-700 disabled:opacity-60 dark:text-emerald-400">
                <span>🟢 Driver free {fmtMins(it.g.s)} – {fmtMins(it.g.e)}</span>
                {canBook && <span>Book →</span>}
              </button>
            ) : null)}
          </div>}
      {form && <BookingForm date={form.date} initialTime={form.time} onClose={() => setForm(null)} onSaved={b => setDay(b.date)} />}
    </div>
  )
}
