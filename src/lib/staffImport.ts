import type { Role } from './types'

export interface StaffRow { full_name: string; email: string; phone: string; role: Role; job_title: string; department: string }
const TITLE_FOR: Record<Role, string> = { agent: '', manager: 'Manager', driver: 'Driver', admin: 'Admin' }
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

/** One person per line: name, email, phone, position, department (commas or tabs).
 *  Position is a job title ("Accountant"); the words agent / manager / driver / admin also set app permissions.
 *  Everyone else starts as an agent — the admin can change the app role in the preview before creating. */
export function parseStaffList(text: string) {
  const rows: StaffRow[] = [], errors: string[] = [], seen = new Set<string>()
  const lines = text.split(/\r?\n/)
  if (lines.filter(l => l.trim()).length > 50) return { rows, errors: ['Add at most 50 people at a time'] }
  lines.forEach((line, i) => {
    if (!line.trim()) return
    const c = line.split(/\t|,/).map(s => s.trim())
    if (i === 0 && /^e-?mail$/i.test(c[1] ?? '')) return // header row (Name, Email, …)
    const n = i + 1
    const [full_name = '', emailRaw = '', phoneRaw = '', posRaw = '', ...rest] = c
    let position = posRaw, dept = rest.join(', ')
    if (!dept && /department$/i.test(position)) { dept = position; position = '' } // "…, phone, Admin Department"
    const email = emailRaw.toLowerCase(), phone = normalisePhone(phoneRaw)
    const word = position.toLowerCase() as Role
    const role: Role = ROLES.includes(word) ? word : 'agent'
    const job_title = ROLES.includes(word) ? TITLE_FOR[word] : position
    if (!full_name) return errors.push(`Line ${n}: name is missing`)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errors.push(`Line ${n}: email "${emailRaw}" is not valid`)
    if (phone && !/^\+[0-9]{8,15}$/.test(phone)) return errors.push(`Line ${n}: phone "${phoneRaw}" should look like +971501234567`)
    if (seen.has(email)) return errors.push(`Line ${n}: ${email} appears twice`)
    seen.add(email)
    rows.push({ full_name: full_name.slice(0, 80), email, phone, role, job_title: job_title.slice(0, 80), department: dept.slice(0, 80) })
  })
  return { rows, errors }
}

export const welcomeMessage = (name: string, email: string, password: string, url: string) =>
  `Hi ${name.split(' ')[0]}, your login for Tierra Viewings (the driver booking app) is ready.\n\n` +
  `Open: ${url}\nEmail: ${email}\nTemporary password: ${password}\n\n` +
  `You'll be asked to choose your own password the first time you sign in. On your phone, tap Share → Add to Home Screen to keep it like an app.`
