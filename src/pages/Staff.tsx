import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { DEPARTMENTS } from '../lib/constants'
import type { Profile, Role } from '../lib/types'
import { Button, Chips, Field, Modal, useToast } from '../components/ui'

const ROLES: { v: Role; l: string }[] = [{ v: 'agent', l: 'Agent' }, { v: 'manager', l: 'Manager' }, { v: 'driver', l: 'Driver' }, { v: 'admin', l: 'Admin' }]
const strongEnough = (p: string) => p.length >= 8

export function Staff() {
  const { profiles, me, refresh } = useData()
  const toast = useToast()
  const [tab, setTab] = useState<'staff' | 'errors'>('staff')
  const [adding, setAdding] = useState(false)
  const [resetFor, setResetFor] = useState<Profile | null>(null)

  async function save(p: Profile, patch: Partial<Profile>) {
    try {
      await api.updateStaff(p.id, patch.role ?? null, patch.active ?? null, patch.department ?? null, patch.phone ?? null)
      await refresh(); toast('Saved', 'ok')
    } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div className="page-in space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Staff</h1>
        <Button onClick={() => setAdding(true)}>＋ Add staff</Button>
      </div>
      <Chips value={tab} onChange={setTab} options={[{ v: 'staff', l: `People (${profiles.length})` }, { v: 'errors', l: 'Error log' }]} />
      {tab === 'errors' ? <ErrorLog /> : (
        <div className="space-y-2">
          {profiles.map(p => (
            <div key={p.id} className={`card flex flex-wrap items-center gap-3 p-3 ${p.active ? '' : 'opacity-60'}`}>
              <div className="min-w-40 flex-1">
                <div className="font-bold">{p.full_name}{p.id === me?.id && <span className="text-fg3"> (you)</span>}</div>
                <div className="text-xs text-fg2">{p.department ?? '—'} · {p.phone ?? 'no phone'}</div>
              </div>
              <select aria-label={`Role for ${p.full_name}`} className="input w-auto py-1.5" value={p.role} disabled={p.id === me?.id} onChange={e => save(p, { role: e.target.value as Role })}>
                {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
              <Button size="sm" variant={p.active ? 'danger' : 'ok'} disabled={p.id === me?.id} onClick={() => save(p, { active: !p.active })}>{p.active ? 'Deactivate' : 'Activate'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setResetFor(p)}>Reset password</Button>
            </div>
          ))}
        </div>
      )}
      {adding && <AddStaff onClose={() => setAdding(false)} onDone={refresh} />}
      {resetFor && <ResetPassword p={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  )
}

function AddStaff({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', email: '', phone: '+971', department: DEPARTMENTS[0], role: 'agent' as Role, password: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Add staff member" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" required full><input className="input" maxLength={80} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email (their login)" required full><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="WhatsApp number"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
        <Field label="Role"><select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></Field>
        <Field label="Department" full><select className="input" value={f.department} onChange={e => setF({ ...f, department: e.target.value })}>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Temporary password (8+ characters)" required full><input className="input font-mono" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <p className="mt-2 text-xs text-fg2">Send them the email and password privately. They should change it under Account after signing in.</p>
      <Button className="mt-4 w-full" busy={busy} disabled={!f.full_name || !f.email || !strongEnough(f.password)} onClick={async () => {
        setBusy(true)
        try { await api.adminStaff({ action: 'create', ...f, phone: f.phone.length > 4 ? f.phone : '' }); await onDone(); toast(`${f.full_name} can now sign in`, 'ok'); onClose() }
        catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
      }}>Create login</Button>
    </Modal>
  )
}

function ResetPassword({ p, onClose }: { p: Profile; onClose: () => void }) {
  const toast = useToast(); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <Modal title={`New password for ${p.full_name}`} onClose={onClose}>
      <Field label="New password (8+ characters)"><input className="input font-mono" value={pw} onChange={e => setPw(e.target.value)} /></Field>
      <Button className="mt-4 w-full" busy={busy} disabled={!strongEnough(pw)} onClick={async () => {
        setBusy(true)
        try { await api.adminStaff({ action: 'reset_password', user_id: p.id, password: pw }); toast('Password changed — send it to them privately', 'ok'); onClose() }
        catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
      }}>Set password</Button>
    </Modal>
  )
}

function ErrorLog() {
  const { nameOf } = useData()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.errors>> | null>(null)
  useEffect(() => { void api.errors().then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <p className="text-fg2">Loading…</p>
  if (!rows.length) return <p className="card p-4 text-sm text-fg2">No errors reported. 🎉</p>
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <details key={r.id} className="card p-3 text-sm">
          <summary className="cursor-pointer"><b>{new Date(r.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}</b> · {nameOf(r.user_id)} · {r.message}</summary>
          <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap text-fg2">{r.url}{'\n'}{r.agent}{'\n'}{r.stack}</pre>
        </details>
      ))}
    </div>
  )
}
