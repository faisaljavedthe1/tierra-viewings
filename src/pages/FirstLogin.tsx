import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { supabase, friendly } from '../lib/supabase'
import { Button, Field, Mark } from '../components/ui'

/** Shown once, right after the first sign-in (or after the admin resets a password). */
export function FirstLogin() {
  const { me, refresh, signOut } = useData()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (pw.length < 8) return setErr('Use at least 8 characters')
    if (pw !== pw2) return setErr('The two passwords do not match')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setErr(/different from the old/i.test(error.message) ? 'Choose a password different from the temporary one' : friendly(error)); setBusy(false); return }
    await api.passwordChanged(); await refresh(); setBusy(false)
  }
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-paper px-5 py-10">
      <div className="page-in w-full max-w-sm">
        <Mark className="mx-auto mb-8 h-10 w-auto" />
        <form onSubmit={save} className="card space-y-4 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand"><KeyRound className="h-6 w-6" aria-hidden /></div>
          <div>
            <h1 className="text-xl font-semibold">Welcome, {me?.full_name.split(' ')[0]}</h1>
            <p className="mt-1 text-sm text-ink2">Please choose your own password. Only you will know it.</p>
          </div>
          <Field label="New password (8+ characters)"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm font-medium text-[var(--s-cancelled)]">{err}</p>}
          <Button type="submit" size="lg" busy={busy} className="w-full">Save and continue</Button>
        </form>
        <button type="button" className="mx-auto mt-6 block text-sm text-ink3 hover:text-ink2" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
