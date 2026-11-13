import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { DriverLocation } from '../lib/types'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export function DriverMap() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pin = useRef<L.CircleMarker | null>(null)
  const [loc, setLoc] = useState<DriverLocation | null | undefined>(undefined)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!el.current) return
    map.current = L.map(el.current, { zoomControl: true }).setView([25.12, 55.2], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map.current)
    void api.driverLocation().then(setLoc).catch(() => setLoc(null))
    const ch = supabase.channel('driver-loc').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_location' },
      p => setLoc(p.eventType === 'DELETE' ? null : (p.new as DriverLocation))).subscribe()
    const t = setInterval(() => tick(x => x + 1), 30_000)
    return () => { clearInterval(t); void supabase.removeChannel(ch); map.current?.remove() }
  }, [])

  useEffect(() => {
    if (!map.current || !loc) { pin.current?.remove(); pin.current = null; return }
    const ll: L.LatLngExpression = [loc.lat, loc.lng]
    if (!pin.current) pin.current = L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: '#5A4B43', fillOpacity: 1 }).addTo(map.current)
    else pin.current.setLatLng(ll)
    map.current.setView(ll, Math.max(map.current.getZoom(), 14))
  }, [loc])

  return (
    <div>
      <div ref={el} className="h-[60vh] w-full overflow-hidden rounded-2xl" />
      <p className="mt-3 text-sm text-ink2">
        {loc === undefined ? 'Loading…' : loc ? <>Last update {ago(loc.updated_at)} · accuracy ±{loc.accuracy ?? '?'} m · <a className="font-medium text-brand underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}>Open in Google Maps</a></>
          : 'The driver is not sharing location right now.'}
      </p>
    </div>
  )
}
