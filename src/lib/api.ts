import { supabase, friendly } from './supabase'
import type { Booking, BookingInput, DriverLocation, Profile, Role } from './types'
import { addDays, dubaiToday } from './time'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendly(error))
  return data as T
}

const payload = (i: BookingInput) => ({ ...i, duration_hours: Number(i.duration_hours) })

export const api = {
  book: (i: BookingInput) => rpc<Booking>('book_viewing', { p: payload(i) }),
  edit: (id: string, i: BookingInput) => rpc<Booking>('edit_booking', { bid: id, p: payload(i) }),
  confirm: (id: string) => rpc<Booking>('confirm_booking', { bid: id }),
  cancel: (id: string, reason: string) => rpc<Booking>('cancel_booking', { bid: id, reason }),
  reschedule: (id: string, date: string, start: string) => rpc<Booking>('reschedule_booking', { bid: id, new_date: date, new_start: start }),
  complete: (id: string) => rpc<Booking>('complete_trip', { bid: id }),
  shareLocation: (lat: number, lng: number, accuracy: number) => rpc<void>('update_driver_location', { p_lat: lat, p_lng: lng, p_accuracy: Math.round(accuracy) }),
  passwordChanged: () => rpc<void>('password_changed', {}),
  clearLocation: () => rpc<void>('clear_driver_location', {}),
  updateStaff: (id: string, role: Role | null, active: boolean | null, department: string | null, phone: string | null) =>
    rpc<void>('admin_update_staff', { uid: id, new_role: role, new_active: active, new_department: department, new_phone: phone }),

  async recentBookings(days = 120): Promise<Booking[]> {
    // Colleagues' bookings arrive with client details removed (see calendar() in migration 0005).
    const { data, error } = await supabase.rpc('calendar', { p_from: addDays(dubaiToday(), -days) })
    if (error) throw new Error(friendly(error))
    return data as Booking[]
  },
  async allBookings(): Promise<Booking[]> {
    const out: Booking[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('bookings').select('*').order('date').order('start_time').range(from, from + 999)
      if (error) throw new Error(friendly(error))
      out.push(...(data as Booking[]))
      if (data.length < 1000) return out
    }
  },
  async profiles(): Promise<Profile[]> {
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, job_title, department, phone, active, must_change_password').order('full_name')
    if (error) throw new Error(friendly(error))
    return data as Profile[]
  },
  async driverLocation(): Promise<DriverLocation | null> {
    const { data, error } = await supabase.from('driver_location').select('*').order('updated_at', { ascending: false }).limit(1)
    if (error) throw new Error(friendly(error))
    return (data?.[0] as DriverLocation) ?? null
  },
  async errors() {
    const { data, error } = await supabase.from('client_errors').select('*').order('at', { ascending: false }).limit(100)
    if (error) throw new Error(friendly(error))
    return data as { id: number; at: string; user_id: string | null; message: string; stack: string | null; url: string | null; agent: string | null }[]
  },
  async adminStaff(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('admin-staff', { body })
    if (error) {
      const ctx = (error as { context?: Response }).context
      const msg = ctx ? (await ctx.json().catch(() => null))?.error : null
      throw new Error(msg ?? friendly(error))
    }
    return data
  },
}
