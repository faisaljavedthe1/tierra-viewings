export type Role = 'agent' | 'manager' | 'driver' | 'admin'
export type Status = 'pending' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'
export type TripType = 'direct' | 'pickup'

export interface Profile {
  id: string
  full_name: string
  role: Role
  department: string | null
  phone: string | null
  active: boolean
}

export interface Booking {
  id: string
  agent_id: string | null
  agent_name: string | null
  department: string | null
  date: string // YYYY-MM-DD
  start_time: string // HH:MM:SS
  duration_mins: number
  area: string
  trip_type: TripType
  pickup_location: string | null
  location: string
  /** null when hidden: colleagues' bookings show time, place and agent only */
  purpose: string | null
  notes: string | null
  client_ref: string | null
  status: Status
  created_at: string
  updated_at: string
  confirmed_at: string | null
  confirmed_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  rescheduled_at: string | null
  rescheduled_by: string | null
  original_date: string | null
  original_start: string | null
  completed_at: string | null
  completed_by: string | null
}

export interface BookingInput {
  date: string
  start_time: string
  duration_hours: number
  area: string
  trip_type: TripType
  pickup_location: string
  location: string
  purpose: string
  notes: string
  client_ref: string
}

export interface DriverLocation {
  driver_id: string
  lat: number
  lng: number
  accuracy: number | null
  updated_at: string
}

export const isManagerRole = (r?: Role | null) => r === 'manager' || r === 'admin'
export const ACTIVE: Status[] = ['pending', 'confirmed', 'rescheduled']
