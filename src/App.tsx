import { Component, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, Link } from 'react-router-dom'
import { CalendarDays, Car, CircleUserRound, ClipboardCheck, ListChecks, Loader2, Users, WifiOff, type LucideIcon } from 'lucide-react'
import { DataProvider, useData } from './lib/data'
import { DriverLocationProvider } from './lib/driverLocation'
import { configured } from './lib/supabase'
import { reportError } from './lib/errors'
import { isManagerRole, type Role } from './lib/types'
import { Mark, ToastProvider, Wordmark } from './components/ui'
import { Login, NotActive } from './pages/Login'
import { FirstLogin } from './pages/FirstLogin'
import { SetupGate, useSetup } from './pages/Setup'
import { Calendar } from './pages/Calendar'
import { Mine } from './pages/Mine'
import { Driver } from './pages/Driver'
import { Account } from './pages/Account'

const Manage = lazy(() => import('./pages/Manage').then(m => ({ default: m.Manage })))
const Staff = lazy(() => import('./pages/Staff').then(m => ({ default: m.Staff })))

interface Tab { to: string; icon: LucideIcon; label: string; el: ReactNode; roles: Role[] }
const TABS: Tab[] = [
  { to: '/', icon: CalendarDays, label: 'Calendar', el: <Calendar />, roles: ['agent', 'manager', 'admin'] },
  { to: '/trips', icon: Car, label: 'Trips', el: <Driver />, roles: ['driver'] },
  { to: '/manage', icon: ClipboardCheck, label: 'Manage', el: <Manage />, roles: ['manager', 'admin'] },
  { to: '/mine', icon: ListChecks, label: 'Mine', el: <Mine />, roles: ['agent', 'manager', 'admin'] },
  { to: '/staff', icon: Users, label: 'Staff', el: <Staff />, roles: ['admin'] },
  { to: '/account', icon: CircleUserRound, label: 'Account', el: <Account />, roles: ['agent', 'manager', 'admin', 'driver'] },
]
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

function Splash() {
  return <div className="flex h-full flex-col items-center justify-center gap-6 bg-paper"><Mark className="h-12 w-auto" /><Loader2 className="h-5 w-5 animate-spin text-ink3" aria-label="Loading" /></div>
}

function Shell() {
  const { session, me, loading, online, signOut, bookings } = useData()
  const setup = useSetup()
  const loc = useLocation()
  if (!session) return <Login />
  if (loading && !me) return <Splash />
  if (!me?.active) return <NotActive onSignOut={signOut} />
  if (me.must_change_password) return <FirstLogin />
  if (!setup.steps) return <Splash />
  if (setup.steps.length) return <SetupGate steps={setup.steps} recheck={setup.check} />

  const tabs = TABS.filter(t => t.roles.includes(me.role))
  const pending = isManagerRole(me.role) ? bookings.filter(b => b.status === 'pending' || b.status === 'rescheduled').length : 0
  const current = tabs.find(t => (t.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.to))) ?? tabs[0]
  const badge = (t: Tab) => t.to === '/manage' && pending > 0 ? <span className="ml-auto min-w-5 rounded-full bg-brass px-1.5 text-center text-[11px] leading-5 font-semibold text-white">{pending}</span> : null

  return (
    <DriverLocationProvider enabled={me.role === 'driver'}>
      <div className="flex min-h-full bg-paper">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
          <div className="mb-8 px-2"><Wordmark className="h-11 w-auto" /><div className="eyebrow mt-3">Viewings</div></div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${isActive ? 'bg-brand-soft text-brand' : 'text-ink2 hover:bg-paper2 hover:text-ink'}`}>
                <t.icon className="h-5 w-5" aria-hidden />{t.label}{badge(t)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">{initials(me.full_name)}</span>
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{me.full_name}</div><div className="truncate text-xs text-ink3 capitalize">{me.job_title || me.role}</div></div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone top bar */}
          <header className="safe-t sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur md:hidden">
            <div className="flex h-14 items-center gap-3 px-4">
              <Mark className="h-6 w-auto" />
              <span className="font-semibold">{current.label}</span>
              <Link to="/account" aria-label="Your account" className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-on-brand">{initials(me.full_name)}</Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-10 md:pb-12">
            {!online && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--s-pending-bg)] px-3 py-2.5 text-sm font-medium text-[var(--s-pending)]"><WifiOff className="h-4 w-4" />You're offline — changes can't be saved until you reconnect.</div>}
            <Suspense fallback={<Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-ink3" aria-label="Loading" />}>
              <Routes>
                {tabs.map(t => <Route key={t.to} path={t.to} element={<div className="page-in">{t.el}</div>} />)}
                <Route path="*" element={<Navigate to={tabs[0].to} replace />} />
              </Routes>
            </Suspense>
          </main>

          {/* Phone tab bar */}
          <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
            <ul className="flex">
              {tabs.map(t => (
                <li key={t.to} className="flex-1">
                  <NavLink to={t.to} end={t.to === '/'} className={({ isActive }) => `relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-ink3'}`}>
                    {({ isActive }) => <>
                      {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand" aria-hidden />}
                      <t.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />{t.label}
                      {t.to === '/manage' && pending > 0 && <span className="absolute top-2 left-1/2 ml-2 min-w-4 rounded-full bg-brass px-1 text-center text-[10px] leading-4 font-semibold text-white">{pending}</span>}
                    </>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </DriverLocationProvider>
  )
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { reportError(e) }
  render() {
    return this.state.failed
      ? <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper p-6 text-center"><Mark className="mb-4 h-10 w-auto" /><h1 className="text-lg font-semibold">Something went wrong</h1><p className="text-sm text-ink2">It has been reported. Reload to carry on.</p><button className="h-11 rounded-xl bg-brand px-5 font-medium text-on-brand" onClick={() => location.reload()}>Reload</button></div>
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
