import { useState } from 'react'
import { Lock } from 'lucide-react'
import { supabase, friendly } from '../lib/supabase'
import { Button, Field, Mark, Wordmark } from '../components/ui'

export function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) setErr(friendly(error))
    setBusy(false)
  }
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="page-in w-full max-w-sm">
          <div className="mb-10 flex flex-col items-center gap-5">
            <Mark className="h-14 w-auto" title="" />
            <Wordmark className="h-12 w-auto" />
          </div>
          <form onSubmit={go} className="card space-y-4 p-6">
            <div>
              <h1 className="text-xl font-semibold">Viewings</h1>
              <p className="mt-1 text-sm text-ink2">Book the company driver for your viewings.</p>
            </div>
            <Field label="Email"><input className="input" type="email" inputMode="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
            {err && <p role="alert" className="rounded-xl bg-[var(--s-cancelled-bg)] px-3 py-2.5 text-sm font-medium text-[var(--s-cancelled)]">{err}</p>}
            <Button type="submit" size="lg" busy={busy} className="w-full">Sign in</Button>
          </form>
          <p className="mt-5 text-center text-sm text-ink3">Forgot your password? Ask Faisal to reset it.</p>
        </div>
      </div>
      <p className="safe-b pb-5 text-center text-xs text-ink3">© Tierra Properties LLC · Dubai</p>
    </div>
  )
}

export function NotActive({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-paper p-6">
      <div className="card page-in max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"><Lock className="h-7 w-7" aria-hidden /></div>
        <h1 className="text-lg font-semibold">Account not active</h1>
        <p className="mt-1 text-sm text-ink2">Your login works, but your access hasn't been switched on (or it was switched off). Please ask Faisal.</p>
        <Button variant="secondary" className="mt-5" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>
  )
}
