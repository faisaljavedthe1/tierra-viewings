import type { Booking } from './types'
import { addDays, isSunday, WE, WS } from './time'

/** Driver utilisation for the last `days` calendar days up to `today`, Sundays skipped. */
export function driverReport(all: Booking[], today: string, days: number) {
  const rows: { date: string; trips: number; bookedMins: number; idleMins: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    if (isSunday(date)) continue
    const done = all.filter(b => b.date === date && (b.status === 'confirmed' || b.status === 'completed'))
    const bookedMins = done.reduce((s, b) => s + b.duration_mins, 0)
    rows.push({ date, trips: done.length, bookedMins, idleMins: Math.max(0, WE - WS - bookedMins) })
  }
  return rows
}
