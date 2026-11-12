import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { api } from './api'
import type { Booking, Profile } from './types'
import { messageFor, scheduleReminders, show } from './notify'
import { dubaiNowMins, dubaiToday } from './time'
import { useToast } from '../components/ui'

interface Data {
  session: Session | null
  me: Profile | null
  loading: boolean
  profiles: Profile[]
  bookings: Booking[]
  online: boolean
  nameOf: (id: string | null) => string
  byId: (id: string | null) => Profile | undefined
  upsert: (b: Booking) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<Data | null>(null)
export const useData = () => { const c = useContext(Ctx); if (!c) throw new Error('DataProvider missing'); return c }

export function DataProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const bRef = useRef<Booking[]>([]); bRef.current = bookings
  const pRef = useRef<Profile[]>([]); pRef.current = profiles
  const meRef = useRef<Profile | null>(null); meRef.current = me

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setMe(null); setBookings([]); setProfiles([]); setLoading(false) } })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  const refresh = useCallback(async () => {
    if (!uid) return
    try {
      const ps = await api.profiles()
      setProfiles(ps)
      const mine = ps.find(p => p.id === uid) ?? null
      setMe(mine)
      if (mine?.active) setBookings(await api.recentBookings())
    } catch (e) { toast((e as Error).message, 'err') } finally { setLoading(false) }
  }, [uid, toast])

  useEffect(() => { if (uid) { setLoading(true); void refresh() } }, [uid, refresh])

  const nameOf = useCallback((id: string | null) => pRef.current.find(p => p.id === id)?.full_name ?? '—', [])
  const byId = useCallback((id: string | null) => pRef.current.find(p => p.id === id), [])
  const upsert = useCallback((b: Booking) => setBookings(list => {
    const i = list.findIndex(x => x.id === b.id)
    return i < 0 ? [...list, b] : list.map(x => (x.id === b.id ? b : x))
  }), [])

  // Live updates. RLS decides which rows this user receives.
  useEffect(() => {
    if (!me?.active) return
    const ch = supabase.channel('bookings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, payload => {
        const after = payload.new as Booking
        if (!after?.id) return
        const before = bRef.current.find(x => x.id === after.id)
        upsert(after)
        const m = meRef.current && messageFor(meRef.current, before, after, nameOf)
        if (m) { toast(m, 'ok'); show('Tierra Viewings', m) }
      })
      .subscribe()
    const back = () => { if (document.visibilityState === 'visible') void refresh() }
    const on = () => { setOnline(true); void refresh() }, off = () => setOnline(false)
    document.addEventListener('visibilitychange', back); addEventListener('online', on); addEventListener('offline', off)
    return () => { void supabase.removeChannel(ch); document.removeEventListener('visibilitychange', back); removeEventListener('online', on); removeEventListener('offline', off) }
  }, [me?.active, refresh, upsert, nameOf, toast])

  useEffect(() => { if (me?.active) scheduleReminders(me, bookings, dubaiToday(), dubaiNowMins()) }, [me, bookings])

  const signOut = useCallback(async () => {
    if (meRef.current?.role === 'driver') await api.clearLocation().catch(() => {})
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(() => ({ session, me, loading, profiles, bookings, online, nameOf, byId, upsert, refresh, signOut }),
    [session, me, loading, profiles, bookings, online, nameOf, byId, upsert, refresh, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
