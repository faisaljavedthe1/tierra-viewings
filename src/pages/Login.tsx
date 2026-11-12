import { useState } from 'react'
import { supabase, friendly } from '../lib/supabase'
import { Button, Field } from '../components/ui'

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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-shell px-4 py-10">
      <div className="orb left-[-80px] top-[-60px] h-72 w-72 bg-[#C07B1E]" />
      <div className="orb right-[-60px] bottom-[-40px] h-80 w-80 bg-[#3B4BC8]" style={{ animationDelay: '-6s' }} />
      <form onSubmit={go} className="page-in relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[.06] p-7 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-1 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-11 w-11" />
          <div>
            <div className="text-xs font-semibold tracking-[.2em] text-[#E9A93A] uppercase">Tierra Properties</div>
            <h1 className="text-xl font-extrabold">Viewings</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-white/60">Sign in with the email and password Faisal gave you.</p>
        <div className="space-y-3 [&_.input]:border-white/15 [&_.input]:bg-white/10 [&_.input]:text-white [&_span]:text-white/70">
          <Field label="Email"><input className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        </div>
        {err && <p role="alert" className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm">{err}</p>}
        <Button type="submit" busy={busy} className="mt-5 w-full py-3">Sign in</Button>
        <p className="mt-4 text-center text-xs text-white/50">Forgot your password? Ask Faisal to reset it.</p>
      </form>
    </div>
  )
}

export function NotActive({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card max-w-sm p-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-2 text-lg font-bold">Account not active</h1>
        <p className="mt-1 text-sm text-fg2">Your login works, but Faisal hasn't given you access yet (or it was switched off). Please ask him.</p>
        <Button variant="ghost" className="mt-4" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>
  )
}
