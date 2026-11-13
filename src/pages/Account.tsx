import { useState } from 'react'
import { useData } from '../lib/data'
import { api } from '../lib/api'
import { supabase, friendly } from '../lib/supabase'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { Button, Chips, Field, useToast } from '../components/ui'
import { PushCard } from '../components/PushCard'

export function Account() {
  const { me, signOut } = useData()
  const toast = useToast()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false)
  const [theme, setT] = useState<Theme>(getTheme())
  return (
    <div className="page-in max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold">Account</h1>
      <div className="card p-4">
        <div className="text-lg font-bold">{me?.full_name}</div>
        <div className="text-sm text-fg2 capitalize">{me?.role} · {me?.department ?? '—'}</div>
      </div>
      <div className="card space-y-3 p-4">
        <h2 className="font-bold">Appearance</h2>
        <Chips value={theme} onChange={v => { setT(v); setTheme(v) }} options={[{ v: 'system', l: 'Auto' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }]} />
      </div>
      <PushCard />
      <form className="card space-y-3 p-4" onSubmit={async e => {
        e.preventDefault()
        if (pw.length < 8) return toast('Use at least 8 characters', 'err')
        if (pw !== pw2) return toast('Passwords do not match', 'err')
        setBusy(true)
        const { error } = await supabase.auth.updateUser({ password: pw })
        setBusy(false)
        if (error) toast(friendly(error), 'err'); else { await api.passwordChanged().catch(() => {}); toast('Password changed', 'ok'); setPw(''); setPw2('') }
      }}>
        <h2 className="font-bold">Change password</h2>
        <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        <Button type="submit" busy={busy}>Update password</Button>
      </form>
      <Button variant="danger" className="w-full" onClick={signOut}>Sign out</Button>
    </div>
  )
}
