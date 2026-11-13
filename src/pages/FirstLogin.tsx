import { useState } from 'react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { supabase, friendly } from '../lib/supabase'
import { Button, Field } from '../components/ui'

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
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={save} className="card page-in w-full max-w-sm space-y-3 p-6">
        <div className="text-4xl">👋</div>
        <h1 className="text-lg font-bold">Welcome, {me?.full_name.split(' ')[0]}</h1>
        <p className="text-sm text-fg2">Please choose your own password. Only you will know it.</p>
        <Field label="New password (8+ characters)"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{err}</p>}
        <Button type="submit" busy={busy} className="w-full">Save and continue</Button>
        <button type="button" className="w-full text-center text-xs text-fg3" onClick={signOut}>Sign out</button>
      </form>
    </div>
  )
}
