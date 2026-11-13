// Who gets a phone notification for each booking change, and what it says (server side).
import { describe, expect, it } from 'vitest'
import { pushesFor, reminderFor, type PushBooking, type Person } from '../../supabase/functions/push-send/messages'

const ppl: Person[] = [
  { id: 'faisal', full_name: 'Faisal Javed', role: 'admin' }, { id: 'nab', full_name: 'Nabeeha Khial', role: 'manager' },
  { id: 'shz', full_name: 'Shazia Larik', role: 'agent' }, { id: 'gag', full_name: 'Gagan Malla', role: 'driver' },
]
const b = (o: Partial<PushBooking> = {}): PushBooking => ({ id: 'b1', agent_id: 'shz', date: '2026-11-17', start_time: '10:00:00', area: 'JVC',
  location: 'Bloom Towers', status: 'pending', cancelled_by: null, cancel_reason: null, ...o })
const to = (r: ReturnType<typeof pushesFor>) => Object.fromEntries(r.map(x => [x.user_id, x.title + ' | ' + x.body]))

describe('booking changes', () => {
  it('new booking → every manager except the one who booked', () => {
    expect(to(pushesFor(null, b(), ppl, '2026-11-16'))).toEqual({
      faisal: '📋 New booking | Shazia Larik · Tomorrow 10:00 AM · JVC', nab: '📋 New booking | Shazia Larik · Tomorrow 10:00 AM · JVC' })
    expect(Object.keys(to(pushesFor(null, b({ agent_id: 'nab' }), ppl, '2026-11-16')))).toEqual(['faisal'])
  })
  it('confirmed → the agent and the driver', () => {
    expect(to(pushesFor('pending', b({ status: 'confirmed' }), ppl, '2026-11-16'))).toEqual({
      shz: '✅ Viewing confirmed | Tomorrow 10:00 AM · JVC', gag: '🚗 New trip | Tomorrow 10:00 AM · JVC — Bloom Towers' })
  })
  it('cancelled by a manager → the agent (with reason) and, if it was confirmed, the driver', () => {
    expect(to(pushesFor('confirmed', b({ status: 'cancelled', cancelled_by: 'nab', cancel_reason: 'Client postponed' }), ppl, '2026-11-16'))).toEqual({
      shz: '❌ Viewing cancelled | Tomorrow 10:00 AM · JVC — Client postponed', gag: '❌ Trip cancelled | Tomorrow 10:00 AM · JVC' })
  })
  it('cancelled by the agent → the managers, not the agent', () => {
    expect(Object.keys(to(pushesFor('pending', b({ status: 'cancelled', cancelled_by: 'shz' }), ppl, '2026-11-16'))).sort()).toEqual(['faisal', 'nab'])
  })
  it('rescheduled → the agent; edits without a status change → nobody', () => {
    expect(to(pushesFor('confirmed', b({ status: 'rescheduled', date: '2026-11-18', start_time: '14:30:00' }), ppl, '2026-11-16'))).toEqual({
      shz: '🔄 Viewing moved | Wed 18 Nov 2:30 PM · JVC — waiting for confirmation' })
    expect(pushesFor('pending', b(), ppl, '2026-11-16')).toEqual([])
  })
  it('never sends client details (purpose, notes) in a notification', () => {
    const all = JSON.stringify(pushesFor('pending', { ...b({ status: 'confirmed' }), purpose: 'Mr Ahmed 0501234567' } as PushBooking, ppl, '2026-11-16'))
    expect(all).not.toContain('Ahmed')
  })
})

describe('reminders', () => {
  it('60 and 15 minutes before a confirmed trip, to the agent and the driver', () => {
    const c = b({ status: 'confirmed', date: '2026-11-16' })
    expect(reminderFor(c, '2026-11-16', 9 * 60, ppl)).toMatchObject({ kind: 'r60', users: ['shz', 'gag'] })    // 09:00 → 10:00
    expect(reminderFor(c, '2026-11-16', 9 * 60 + 45, ppl)).toMatchObject({ kind: 'r15' })
    expect(reminderFor(c, '2026-11-16', 9 * 60 + 20, ppl)).toBeNull()                                            // in between
    expect(reminderFor(b({ status: 'pending', date: '2026-11-16' }), '2026-11-16', 9 * 60, ppl)).toBeNull()
    expect(reminderFor(c, '2026-11-15', 9 * 60, ppl)).toBeNull()                                                 // not today
  })
})
