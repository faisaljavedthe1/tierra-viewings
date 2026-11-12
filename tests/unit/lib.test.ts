// Unit tests for the app's pure logic. Written before src/lib (TDD). Run: npm run test:unit
import { describe, expect, it } from 'vitest'
import { addDays, dubaiToday, fmtTime, gaps, isSunday, m2t, monday, t2m, validateBooking, weekDays, WS, WE } from '../../src/lib/time'
import { toCsv } from '../../src/lib/csv'
import { waLink, newBookingMessage, confirmedMessage } from '../../src/lib/whatsapp'
import { driverReport } from '../../src/lib/report'
import type { Booking } from '../../src/lib/types'

const b = (o: Partial<Booking>): Booking => ({
  id: 'x', agent_id: 'a', department: null, date: '2026-11-17', start_time: '10:00:00', duration_mins: 120,
  area: 'Dubai Marina', trip_type: 'direct', pickup_location: null, location: 'Marina Gate', purpose: 'Viewing',
  notes: null, client_ref: null, status: 'pending', created_at: '', updated_at: '', confirmed_at: null, confirmed_by: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null, rescheduled_at: null, rescheduled_by: null,
  original_date: null, original_start: null, completed_at: null, completed_by: null, ...o,
})

describe('time helpers', () => {
  it('converts times', () => {
    expect(t2m('09:30')).toBe(570); expect(t2m('09:30:00')).toBe(570)
    expect(m2t(570)).toBe('09:30'); expect(fmtTime('13:05:00')).toBe('1:05 PM'); expect(fmtTime('00:10')).toBe('12:10 AM')
    expect([WS, WE]).toEqual([570, 1080])
  })
  it('handles dates without timezone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(isSunday('2026-11-22')).toBe(true); expect(isSunday('2026-11-16')).toBe(false)
    expect(monday('2026-11-22')).toBe('2026-11-16'); expect(monday('2026-11-16')).toBe('2026-11-16')
    expect(weekDays('2026-11-16')).toHaveLength(6) // Mon–Sat
  })
  it('gets today in Dubai, not in the device timezone', () => {
    expect(dubaiToday(new Date('2026-11-16T21:30:00Z'))).toBe('2026-11-17') // 01:30 Dubai next day
  })
})

describe('free gaps for the driver', () => {
  it('lists gaps of at least an hour, ignoring cancelled and completed-in-place rules', () => {
    const day = [b({ start_time: '10:00:00', duration_mins: 120 }), b({ start_time: '14:00:00', duration_mins: 60 }),
      b({ start_time: '16:00:00', status: 'cancelled' })]
    expect(gaps(day)).toEqual([{ s: 720, e: 840 }, { s: 900, e: 1080 }])
  })
  it('rescheduled bookings still occupy their slot', () => {
    expect(gaps([b({ start_time: '09:30:00', duration_mins: 510, status: 'rescheduled' })])).toEqual([])
  })
})

describe('client-side validation mirrors the database', () => {
  const now = new Date('2026-11-16T05:00:00Z') // 09:00 Dubai Monday
  const ok = { date: '2026-11-17', start_time: '10:00', duration_hours: 2, area: 'JVC', trip_type: 'direct' as const,
    pickup_location: '', location: 'Bloom Towers', purpose: 'Viewing', notes: '', client_ref: '' }
  it('passes a valid booking', () => expect(validateBooking(ok, [], now)).toEqual([]))
  it('flags every problem with the field it belongs to', () => {
    const e = validateBooking({ ...ok, area: '', purpose: ' ', trip_type: 'pickup' }, [], now)
    expect(e.map(x => x.field)).toEqual(['area', 'pickup_location', 'purpose'])
  })
  it('flags Sunday, hours, notice and overlap', () => {
    expect(validateBooking({ ...ok, date: '2026-11-22' }, [], now)[0].message).toMatch(/Sunday/)
    expect(validateBooking({ ...ok, start_time: '18:00' }, [], now)[0].message).toMatch(/6:00 PM/)
    expect(validateBooking({ ...ok, date: '2026-11-16', start_time: '09:30' }, [], new Date('2026-11-16T05:10:00Z'))[0].message).toMatch(/30 minutes/)
    expect(validateBooking({ ...ok, date: '2026-11-16', start_time: '09:30' }, [], now)).toEqual([]) // exactly 30 min is fine
    expect(validateBooking(ok, [b({ start_time: '11:00:00' })], now)[0].message).toMatch(/Driver is already booked/)
    expect(validateBooking(ok, [b({ id: 'self', start_time: '11:00:00' })], now, 'self')).toEqual([])
  })
})

describe('CSV export', () => {
  it('escapes commas, quotes and new lines and blocks spreadsheet formulas', () => {
    expect(toCsv([['a', 'b,c'], ['say "hi"', 'x\ny'], ['=HYPERLINK("evil")', '+1', '-2', '@x']]))
      .toBe('a,"b,c"\r\n"say ""hi""","x\ny"\r\n"\'=HYPERLINK(""evil"")",\'+1,\'-2,\'@x')
  })
})

describe('WhatsApp links', () => {
  it('builds wa.me links from any UAE format', () => {
    expect(waLink('+971 50 524 4024', 'hi there')).toBe('https://wa.me/971505244024?text=hi%20there')
    expect(waLink('', 'x')).toBeNull()
  })
  it('writes the messages', () => {
    expect(newBookingMessage('Shazia', b({}))).toContain('Dubai Marina')
    expect(confirmedMessage('Shazia', b({}), 'Nabeeha')).toMatch(/^✅ Hi Shazia/)
  })
})

describe('driver report', () => {
  it('sums booked hours per working day and skips Sundays', () => {
    const r = driverReport([b({ status: 'confirmed', date: '2026-11-21' }), b({ status: 'completed', date: '2026-11-21', start_time: '13:00:00' }),
      b({ status: 'pending', date: '2026-11-21' })], '2026-11-23', 3)
    expect(r.map(x => x.date)).toEqual(['2026-11-21', '2026-11-23']) // 22nd is Sunday
    expect(r[0]).toMatchObject({ trips: 2, bookedMins: 240, idleMins: 270 })
  })
})
