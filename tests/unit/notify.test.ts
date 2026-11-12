import { describe, expect, it } from 'vitest'
import { messageFor } from '../../src/lib/notify'
import type { Booking, Profile } from '../../src/lib/types'

const p = (id: string, role: Profile['role']): Profile => ({ id, full_name: id, role, department: null, phone: null, active: true })
const agent = p('agent', 'agent'), mgr = p('mgr', 'manager'), drv = p('drv', 'driver')
const b = (o: Partial<Booking>) => ({ id: '1', agent_id: 'agent', date: '2030-01-07', start_time: '10:00:00', duration_mins: 60, area: 'JVC', status: 'pending', ...o }) as Booking
const name = (id: string) => id

describe('who gets told what', () => {
  it('managers hear about new bookings; the agent does not get an echo', () => {
    expect(messageFor(mgr, undefined, b({}), name)).toMatch(/New booking by agent/)
    expect(messageFor(agent, undefined, b({}), name)).toBeNull()
  })
  it('the agent hears about confirmations, moves and manager cancellations', () => {
    expect(messageFor(agent, b({}), b({ status: 'confirmed' }), name)).toMatch(/confirmed/)
    expect(messageFor(agent, b({}), b({ status: 'rescheduled' }), name)).toMatch(/moved/)
    expect(messageFor(agent, b({}), b({ status: 'cancelled', cancelled_by: 'mgr', cancel_reason: 'no car' }), name)).toMatch(/cancelled — no car/)
    expect(messageFor(agent, b({}), b({ status: 'cancelled', cancelled_by: 'agent' }), name)).toBeNull()
  })
  it('the driver hears about new confirmed trips and cancelled trips', () => {
    expect(messageFor(drv, b({}), b({ status: 'confirmed' }), name)).toMatch(/New trip/)
    expect(messageFor(drv, b({ status: 'confirmed' }), b({ status: 'cancelled' }), name)).toMatch(/cancelled/)
  })
  it('managers hear when an agent cancels; edits without a status change are silent', () => {
    expect(messageFor(mgr, b({}), b({ status: 'cancelled', cancelled_by: 'agent' }), name)).toMatch(/agent cancelled/)
    expect(messageFor(mgr, b({}), b({ area: 'Marina' }), name)).toBeNull()
  })
})
