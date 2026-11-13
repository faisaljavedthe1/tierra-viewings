import { describe, expect, it } from 'vitest'
import { parseStaffList, welcomeMessage } from '../../src/lib/staffImport'

describe('parsing a pasted staff list', () => {
  it('reads name, email, phone, role, department — one person per line', () => {
    const r = parseStaffList(`Joie Gracia, ea@themasinvestments.com, +971502247037, manager, Operations/Management Department
      Gagan Malla, Gaganmalla23@gmail.com, +971 50 524 4024, driver
      Shazia Larik, larik.srso@gmail.com, 0522647579`)
    expect(r.rows).toEqual([
      { full_name: 'Joie Gracia', email: 'ea@themasinvestments.com', phone: '+971502247037', role: 'manager', job_title: 'Manager', department: 'Operations/Management Department' },
      { full_name: 'Gagan Malla', email: 'gaganmalla23@gmail.com', phone: '+971505244024', role: 'driver', job_title: 'Driver', department: '' },
      { full_name: 'Shazia Larik', email: 'larik.srso@gmail.com', phone: '+971522647579', role: 'agent', job_title: '', department: '' },
    ])
    expect(r.errors).toEqual([])
  })
  it('accepts tabs (pasted from Excel / Sheets) and skips blank lines and a header', () => {
    const r = parseStaffList('Name\tEmail\tPhone\tRole\n\nBahaa Khizer\tkhizerbahaa1@gmail.com\t+971561746669\tAgent\n')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].role).toBe('agent')
  })
  it('reports problems with the line number and keeps the good rows', () => {
    const r = parseStaffList(`A Person, not-an-email\nB Person, b@x.com, 12, agent\nD, d@x.com\nD Again, d@x.com`)
    expect(r.errors).toEqual([
      'Line 1: email "not-an-email" is not valid',
      'Line 2: phone "12" should look like +971501234567',
      'Line 4: d@x.com appears twice',
    ])
    expect(r.rows.map(x => x.full_name)).toEqual(['D'])
  })
  it('refuses more than 50 people at once', () => {
    const many = Array.from({ length: 51 }, (_, i) => `P${i}, p${i}@x.com`).join('\n')
    expect(parseStaffList(many).errors[0]).toMatch(/50/)
  })
})

describe('job titles are separate from app permissions', () => {
  it('a position like "Accountant" becomes the job title; the app role defaults to agent', () => {
    const r = parseStaffList(`Oshani Amaranath, info@espadagroup.ae, +971545264159, Accountant, Accounts Department
Gagan Malla, gaganmalla23@gmail.com, +971505244024, driver
Joie Gracia, ea@themasinvestments.com, +971502247037, Personal Assistant, Admin Department`)
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { full_name: 'Oshani Amaranath', email: 'info@espadagroup.ae', phone: '+971545264159', role: 'agent', job_title: 'Accountant', department: 'Accounts Department' },
      { full_name: 'Gagan Malla', email: 'gaganmalla23@gmail.com', phone: '+971505244024', role: 'driver', job_title: 'Driver', department: '' },
      { full_name: 'Joie Gracia', email: 'ea@themasinvestments.com', phone: '+971502247037', role: 'agent', job_title: 'Personal Assistant', department: 'Admin Department' },
    ])
  })
  it('a missing position with the department in its place is read as the department', () => {
    const r = parseStaffList('Nabeeha Khial, info@tierraproperties.ae, +971508123721,  Admin Department')
    expect(r.rows[0]).toMatchObject({ role: 'agent', job_title: '', department: 'Admin Department' })
  })
  it('the words manager / admin still give app permissions', () => {
    expect(parseStaffList('A, a@x.com, , Manager, Sales Department').rows[0]).toMatchObject({ role: 'manager', job_title: 'Manager' })
  })
})

describe('welcome message', () => {
  it('has the link, the email and the temporary password, and asks them to change it', () => {
    const m = welcomeMessage('Shazia Larik', 'larik.srso@gmail.com', 'Kx7-Pq2m-Ry9t', 'https://app.test')
    expect(m).toContain('Hi Shazia'); expect(m).toContain('https://app.test')
    expect(m).toContain('larik.srso@gmail.com'); expect(m).toContain('Kx7-Pq2m-Ry9t'); expect(m).toMatch(/choose your own password/i)
  })
})
