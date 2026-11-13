import { useMemo, useState } from 'react'
import { CalendarX2, ChevronLeft, ChevronRight, Moon, Plus } from 'lucide-react'
import { useData } from '../lib/data'
import { addDays, DAYS, dubaiToday, endMins, fmtDate, fmtMins, fmtTime, gaps, isSunday, m2t, monday, MONTHS, t2m, weekDays, WE, WS } from '../lib/time'
import type { Booking } from '../lib/types'
import { BookingCard } from '../components/BookingCard'
import { BookingForm } from '../components/BookingForm'
import { Button, Empty, Modal, PageHead, StatusPill } from '../components/ui'

const PX = 1.5 // pixels per minute on the day timeline

export function Calendar() {
  const { bookings, agentOf } = useData()
  const today = dubaiToday()
  const [day, setDay] = useState(isSunday(today) ? addDays(today, 1) : today)
  const [form, setForm] = useState<{ date: string; time?: string } | null>(null)
  const [open, setOpen] = useState<Booking | null>(null)
  const week = weekDays(monday(day))
  const dayList = useMemo(() => bookings.filter(b => b.date === day && b.status !== 'cancelled').sort((a, z) => a.start_time.localeCompare(z.start_time)), [bookings, day])
  const count = (d: string) => bookings.filter(b => b.date === d && b.status !== 'cancelled').length
  const free = gaps(dayList)
  const canBook = day >= today && !isSunday(day)
  const d0 = new Date(week[0] + 'T00:00:00Z'), d5 = new Date(week[5] + 'T00:00:00Z')
  const range = `${d0.getUTCDate()} ${MONTHS[d0.getUTCMonth()]} – ${d5.getUTCDate()} ${MONTHS[d5.getUTCMonth()]} ${d5.getUTCFullYear()}`
  const hours = Array.from({ length: 9 }, (_, i) => (10 + i) * 60) // 10:00 … 18:00
  const selected = open && bookings.find(b => b.id === open.id)

  return (
    <div>
      <PageHead eyebrow="Driver calendar" title={fmtDate(day)} actions={<Button icon={Plus} onClick={() => setForm({ date: canBook ? day : today })}>Book</Button>} />

      <div className="card mb-5 p-3">
        <div className="mb-3 flex items-center justify-between">
          <button aria-label="Previous week" className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-paper2" onClick={() => setDay(addDays(week[0], -7))}><ChevronLeft className="h-5 w-5" /></button>
          <div className="text-center"><div className="text-sm font-medium">{range}</div>
            {day !== today && <button className="text-xs font-medium text-brass" onClick={() => setDay(isSunday(today) ? addDays(today, 1) : today)}>Back to today</button>}</div>
          <button aria-label="Next week" className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-paper2" onClick={() => setDay(addDays(week[0], 7))}><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {week.map(d => {
            const n = count(d), on = d === day, x = new Date(d + 'T00:00:00Z'), past = d < today
            return (
              <button key={d} onClick={() => setDay(d)} aria-pressed={on}
                className={`flex flex-col items-center rounded-xl py-2 transition ${on ? 'bg-brand text-on-brand shadow-sm' : d === today ? 'bg-brand-soft text-brand' : past ? 'text-ink3 hover:bg-paper2' : 'hover:bg-paper2'}`}>
                <span className="text-[11px] font-medium tracking-wide uppercase opacity-80">{DAYS[x.getUTCDay()]}</span>{' '}
                <span className="text-lg leading-tight font-semibold">{x.getUTCDate()}</span>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${n ? (on ? 'bg-on-brand' : 'bg-brass') : 'bg-transparent'}`} aria-label={n ? `${n} bookings` : undefined} />
              </button>
            )
          })}
        </div>
      </div>

      {isSunday(day) ? <Empty icon={Moon} title="Sunday — day off" text="No viewings on Sundays." /> : (
        <section aria-label={`Timeline for ${fmtDate(day)}`} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
            <span className="font-medium">{dayList.length ? `${dayList.length} booking${dayList.length === 1 ? '' : 's'}` : 'Nothing booked yet'}</span>
            <span className="text-ink3">9:30 AM – 6:00 PM</span>
          </div>
          {dayList.length === 0 && !canBook ? <div className="p-4"><Empty icon={CalendarX2} title="No bookings" /></div> : (
            <div className="relative ml-16 mr-3 my-3" style={{ height: (WE - WS) * PX }}>
              {[WS, ...hours].map(m => (
                <div key={m} className="absolute inset-x-0 border-t border-line" style={{ top: (m - WS) * PX }}>
                  <span className="absolute -top-2.5 -left-16 w-14 pr-2 text-right text-[11.5px] text-ink3">{fmtMins(m).replace(':00', '')}</span>
                </div>
              ))}
              {free.map(g => (
                <button key={'g' + g.s} disabled={!canBook} onClick={() => setForm({ date: day, time: m2t(g.s) })}
                  aria-label={`Driver free ${fmtMins(g.s)} – ${fmtMins(g.e)}${canBook ? ', book this time' : ''}`}
                  className="absolute inset-x-1 flex items-center justify-center rounded-xl border border-dashed border-[var(--s-confirmed)]/40 text-[13px] font-medium text-[var(--s-confirmed)] transition hover:bg-[var(--s-confirmed-bg)] disabled:opacity-60"
                  style={{ top: (g.s - WS) * PX + 3, height: (g.e - g.s) * PX - 6 }}>
                  {canBook && <Plus className="mr-1 h-4 w-4" aria-hidden />}Free · {fmtMins(g.s)} – {fmtMins(g.e)}
                </button>
              ))}
              {dayList.map(b => {
                const top = (t2m(b.start_time) - WS) * PX, h = Math.max(b.duration_mins * PX, 46)
                return (
                  <button key={b.id} onClick={() => setOpen(b)} aria-label={`${fmtTime(b.start_time)} ${b.area}, ${agentOf(b)}, ${b.status}`}
                    className={`absolute inset-x-1 overflow-hidden rounded-xl border-l-4 px-3 py-2 text-left shadow-sm transition hover:brightness-[.98] bar-${b.status}`}
                    style={{ top: top + 2, height: h - 4 }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold">{fmtTime(b.start_time)} – {fmtMins(endMins(b))}</div>
                        <div className="truncate text-[14px] text-ink">{b.area}{b.duration_mins >= 60 && <span className="text-ink2"> · {agentOf(b)}</span>}</div>
                      </div>
                      {b.duration_mins >= 60 && <StatusPill s={b.status} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {selected && <Modal title="Booking" onClose={() => setOpen(null)}><BookingCard b={selected} showDate plain /></Modal>}
      {form && <BookingForm date={form.date} initialTime={form.time} onClose={() => setForm(null)} onSaved={b => setDay(b.date)} />}
    </div>
  )
}
