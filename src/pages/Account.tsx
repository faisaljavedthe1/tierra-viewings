import { useState } from 'react'
import { KeyRound, LogOut, Palette } from 'lucide-react'
import { useData } from '../lib/data'
import { api } from '../lib/api'
import { supabase, friendly } from '../lib/supabase'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { Button, Chips, Field, PageHead, useToast } from '../components/ui'
import { PushCard } from '../components/PushCard'

export function Account() {
  const { me, signOut } = useData()
  const toast = useToast()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false)
  const [theme, setT] = useState<Theme>(getTheme())
  const initials = (me?.full_name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="max-w-xl space-y-4">
      <PageHead eyebrow="Account" title="Your profile" />
      <div className="card flex items-center gap-4 p-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-semibold text-on-brand">{initials}</span>
        <div className="min-w-0">
          <div className="text-lg font-semibold">{me?.full_name}</div>
          <div className="text-sm text-ink2">{[me?.job_title, me?.department].filter(Boolean).join(' · ') || '—'}</div>
          <div className="mt-1 text-xs text-ink3 capitalize">App access: {me?.role}</div>
        </div>
      </div>
      <PushCard />
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-brand" aria-hidden /><h2 className="font-semibold">Appearance</h2></div>
        <Chips value={theme} onChange={v => { setT(v); setTheme(v) }} options={[{ v: 'system', l: 'Match phone' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }]} />
      </div>
      <form className="card space-y-3 p-4" onSubmit={async e => {
        e.preventDefault()
        if (pw.length < 8) return toast('Use at least 8 characters', 'err')
        if (pw !== pw2) return toast('Passwords do not match', 'err')
        setBusy(true)
        const { error } = await supabase.auth.updateUser({ password: pw })
        setBusy(false)
        if (error) toast(friendly(error), 'err'); else { await api.passwordChanged().catch(() => {}); toast('Password changed', 'ok'); setPw(''); setPw2('') }
      }}>
        <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-brand" aria-hidden /><h2 className="font-semibold">Change password</h2></div>
        <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        <Button type="submit" busy={busy}>Update password</Button>
      </form>
      <Button variant="secondary" icon={LogOut} className="w-full" onClick={signOut}>Sign out</Button>
    </div>
  )
}
