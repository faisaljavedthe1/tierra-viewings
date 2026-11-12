import type { Booking } from './types'
import { fmtDate, fmtTime } from './time'

export function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^00/, '')
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

export const newBookingMessage = (agent: string, b: Booking) =>
  `📋 New viewing booking by ${agent}\n📅 ${fmtDate(b.date)} at ${fmtTime(b.start_time)}\n📍 ${b.area} — ${b.location}\n📝 ${b.purpose}\nPlease confirm the driver. Thank you!`

export const confirmedMessage = (agent: string, b: Booking, by: string) =>
  `✅ Hi ${agent}, your viewing on ${fmtDate(b.date)} at ${fmtTime(b.start_time)} (${b.area}) has been confirmed. The driver will be there. – ${by}`
