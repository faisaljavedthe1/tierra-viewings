import { Component, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { DataProvider, useData } from './lib/data'
import { configured } from './lib/supabase'
import { reportError } from './lib/errors'
import { isManagerRole, type Role } from './lib/types'
import { ToastProvider } from './components/ui'
import { PushNudge } from './components/PushCard'
import { Login, NotActive } from './pages/Login'
import { Calendar } from './pages/Calendar'
import { Mine } from './pages/Mine'
import { Driver } from './pages/Driver'
import { Account } from './pages/Account'
import { FirstLogin } from './pages/FirstLogin'

const Manage = lazy(() => import('./pages/Manage').then(m => ({ default: m.Manage })))
const Staff = lazy(() => import('./pages/Staff').then(m => ({ default: m.Staff })))

interface Tab { to: string; icon: string; label: string; el: ReactNode; roles: Role[] }
const TABS: Tab[] = [
  { to: '/', icon: '🗓️', label: 'Calendar', el: <Calendar />, roles: ['agent', 'manager', 'admin'] },
  { to: '/trips', icon: '🚗', label: 'Trips', el: <Driver />, roles: ['driver'] },
  { to: '/manage', icon: '✅', label: 'Manage', el: <Manage />, roles: ['manager', 'admin'] },
  { to: '/mine', icon: '📋', label: 'Mine', el: <Mine />, roles: ['agent', 'manager', 'admin'] },
  { to: '/staff', icon: '👥', label: 'Staff', el: <Staff />, roles: ['admin'] },
  { to: '/account', icon: '⚙️', label: 'Account', el: <Account />, roles: ['agent', 'manager', 'admin', 'driver'] },
]

function Shell() {
  const { session, me, loading, online, signOut, bookings } = useData()
  if (!session) return <Login />
  if (loading && !me) return <div className="flex h-full items-center justify-center text-fg2">Loading…</div>
  if (!me?.active) return <NotActive onSignOut={signOut} />
  if (me.must_change_password) return <FirstLogin />
  const tabs = TABS.filter(t => t.roles.includes(me.role))
  const pending = isManagerRole(me.role) ? bookings.filter(b => b.status === 'pending' || b.status === 'rescheduled').length : 0
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-shell/95 backdrop-blur md:static md:w-60 md:border-t-0 md:border-r md:p-4">
        <div className="mb-6 hidden items-center gap-2 px-2 text-white md:flex">
          <img src="/icon.svg" alt="" className="h-9 w-9" /><div><div className="text-[10px] font-bold tracking-[.2em] text-[#E9A93A]">TIERRA</div><div className="font-extrabold">Viewings</div></div>
        </div>
        <ul className="flex justify-around md:flex-col md:gap-1">
          {tabs.map(t => (
            <li key={t.to}>
              <NavLink to={t.to} end className={({ isActive }) => `relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition md:flex-row md:gap-3 md:text-sm ${isActive ? 'bg-[#C07B1E]/20 text-[#F2B65A]' : 'text-white/55 hover:text-white'}`}>
                <span className="text-lg md:text-base" aria-hidden>{t.icon}</span>{t.label}
                {t.to === '/manage' && pending > 0 && <span className="absolute -top-0.5 right-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white md:static md:ml-auto">{pending}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="safe-t mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:pb-10">
        {!online && <div role="status" className="mb-3 rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">You're offline — changes can't be saved until you reconnect.</div>}
        <PushNudge />
        <Suspense fallback={<p className="text-fg2">Loading…</p>}>
          <Routes>
            {tabs.map(t => <Route key={t.to} path={t.to} element={t.el} />)}
            <Route path="*" element={<Navigate to={tabs[0].to} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { reportError(e) }
  render() {
    return this.state.failed
      ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="text-lg font-bold">Something went wrong</h1><p className="text-sm text-fg2">It has been reported. Reload to carry on.</p><button className="gold-grad rounded-xl px-4 py-2 font-semibold text-white" onClick={() => location.reload()}>Reload</button></div>
      : this.props.children
  }
}

export default function App() {
  if (!configured) return <div className="p-6">Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.</div>
  return (
    <Boundary>
      <ToastProvider>
        <DataProvider>
          <BrowserRouter><Shell /></BrowserRouter>
        </DataProvider>
      </ToastProvider>
    </Boundary>
  )
}
