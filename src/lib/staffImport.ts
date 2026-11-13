import type { Role } from './types'

export interface StaffRow { full_name: string; email: string; phone: string; role: Role; department: string }
const ROLES: Role[] = ['agent', 'manager', 'driver', 'admin']

/** UAE-friendly phone clean-up: "050 123 4567" → "+971501234567". Empty stays empty. */
export function normalisePhone(raw: string) {
  const d = raw.replace(/[^\d+]/g, '')
  if (!d) return ''
  if (d.startsWith('+')) return d
  if (d.startsWith('00')) return '+' + d.slice(2)
  if (d.startsWith('971')) return '+' + d
  if (/^05\d{8}$/.test(d)) return '+971' + d.slice(1)
  return d
}

/** One person per line: name, email, phone, role, department (commas or tabs). */
export function parseStaffList(text: string) {
  const rows: StaffRow[] = [], errors: string[] = [], seen = new Set<string>()
  const lines = text.split(/\r?\n/)
  if (lines.filter(l => l.trim()).length > 50) return { rows, errors: ['Add at most 50 people at a time'] }
  lines.forEach((line, i) => {
    if (!line.trim()) return
    const c = line.split(/\t|,/).map(s => s.trim())
    if (i === 0 && /^e-?mail$/i.test(c[1] ?? '')) return // header row (Name, Email, …)
    const n = i + 1
    const [full_name = '', emailRaw = '', phoneRaw = '', roleRaw = '', ...dept] = c
    const email = emailRaw.toLowerCase(), phone = normalisePhone(phoneRaw), role = (roleRaw.toLowerCase() || 'agent') as Role
    if (!full_name) return errors.push(`Line ${n}: name is missing`)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errors.push(`Line ${n}: email "${emailRaw}" is not valid`)
    if (phone && !/^\+[0-9]{8,15}$/.test(phone)) return errors.push(`Line ${n}: phone "${phoneRaw}" should look like +971501234567`)
    if (!ROLES.includes(role)) return errors.push(`Line ${n}: role "${roleRaw}" — use agent, manager, driver or admin`)
    if (seen.has(email)) return errors.push(`Line ${n}: ${email} appears twice`)
    seen.add(email)
    rows.push({ full_name: full_name.slice(0, 80), email, phone, role, department: dept.join(', ').slice(0, 80) })
  })
  return { rows, errors }
}

export const welcomeMessage = (name: string, email: string, password: string, url: string) =>
  `Hi ${name.split(' ')[0]}, your login for Tierra Viewings (the driver booking app) is ready.\n\n` +
  `Open: ${url}\nEmail: ${email}\nTemporary password: ${password}\n\n` +
  `You'll be asked to choose your own password the first time you sign in. On your phone, tap Share → Add to Home Screen to keep it like an app.`
