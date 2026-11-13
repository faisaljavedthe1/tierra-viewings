/**
 * Place search for bookings, all free and key-less: our own Dubai list first, then OpenStreetMap through two
 * search engines (Nominatim and Photon — Photon is better at partial words like "marina ga"). People can also
 * paste a Google Maps link or coordinates, and free text is always accepted.
 */
export type Parsed = { kind: 'coords'; lat: number; lng: number } | { kind: 'link'; url: string } | { kind: 'text' }

const inUae = (lat: number, lng: number) => lat >= 22 && lat <= 26.5 && lng >= 51 && lng <= 57
// Exact Google hosts only (google.com, google.ae, google.co.uk …) — never look-alikes such as google.evil.com.
const MAPS_HOSTS = /^(?:www\.|maps\.)?google\.(?:com|ae|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$|^(?:maps\.app\.goo\.gl|goo\.gl)$/i

export function parsePlace(raw: string): Parsed {
  const s = raw.trim()
  const c = s.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/)
  if (c && inUae(+c[1], +c[2])) return { kind: 'coords', lat: +c[1], lng: +c[2] }
  const m = s.match(/https:\/\/[^\s]+/)
  if (m) {
    let u: URL
    try { u = new URL(m[0]) } catch { return { kind: 'text' } }
    if (!MAPS_HOSTS.test(u.hostname)) return { kind: 'text' }
    if (u.hostname.includes('goo.gl') && !(u.hostname === 'goo.gl' && !u.pathname.startsWith('/maps'))) return { kind: 'link', url: u.href }
    const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? (u.searchParams.get('q') ?? u.searchParams.get('query') ?? '').match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/)
    if (at && inUae(+at[1], +at[2])) return { kind: 'coords', lat: +at[1], lng: +at[2] }
    if (u.pathname.startsWith('/maps')) return { kind: 'link', url: u.href }
  }
  return { kind: 'text' }
}

/** A Google Maps link the driver can tap — opening Google Maps is free, only its developer APIs cost money. */
export function mapsUrl(location: string): string | null {
  if (!location.trim()) return null
  const p = parsePlace(location)
  if (p.kind === 'link') return p.url
  const q = p.kind === 'coords' ? `${p.lat},${p.lng}` : location.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function photonLabel(p: { name?: string; housenumber?: string; street?: string; district?: string; locality?: string; city?: string }) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const parts = [p.name, street, p.district ?? p.locality, p.city].filter((x): x is string => !!x)
  return parts.filter((x, i) => parts.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).join(', ')
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function mergeHits(lists: string[][], max = 8) {
  const seen = new Set<string>(), out: string[] = []
  for (const l of lists) for (const h of l) { const k = norm(h); if (k && !seen.has(k)) { seen.add(k); out.push(h) } }
  return out.slice(0, max)
}

export function curatedHits(q: string, max = 4) {
  const words = norm(q).split(' ').filter(Boolean)
  if (norm(q).length < 3) return []
  const alias: Record<string, string> = { jvc: 'jumeirah village circle', jvt: 'jumeirah village triangle', jlt: 'jumeirah lake towers', jbr: 'jumeirah beach residence', difc: 'difc', dso: 'dubai silicon oasis', mbr: 'mohammed bin rashid', dip: 'dubai investments park', jge: 'jumeirah golf estates', dsc: 'dubai sports city', imp: 'international media production' }
  const expanded = words.flatMap(w => alias[w] ? alias[w].split(' ') : [w])
  return DUBAI_PLACES.filter(p => { const n = norm(p); return expanded.every(w => n.includes(w)) }).slice(0, max)
}

/** Communities, towers and landmarks agents use most. Add more here any time — it costs nothing. */
export const DUBAI_PLACES: string[] = [
  // Communities
  'Jumeirah Village Circle (JVC)', 'Jumeirah Village Triangle (JVT)', 'Jumeirah Lake Towers (JLT)', 'Jumeirah Beach Residence (JBR)',
  'Dubai Marina', 'Downtown Dubai', 'Business Bay', 'DIFC', 'Palm Jumeirah', 'Dubai Hills Estate', 'Arabian Ranches', 'Arabian Ranches 2',
  'Arabian Ranches 3', 'DAMAC Hills', 'DAMAC Hills 2 (Akoya)', 'DAMAC Lagoons', 'Dubai Creek Harbour', 'Emaar Beachfront', 'Bluewaters Island',
  'City Walk', 'La Mer', 'Jumeirah', 'Umm Suqeim', 'Al Barsha', 'Al Barsha South', 'Al Sufouh', 'Tecom (Barsha Heights)', 'Al Quoz',
  'Al Furjan', 'Discovery Gardens', 'The Gardens', 'Jebel Ali Village', 'Dubai Production City (IMPZ)', 'Dubai Sports City',
  'Motor City', 'Dubai Silicon Oasis', 'International City', 'Dubai Land', 'Town Square', 'Mudon', 'Remraam', 'Serena', 'Villanova',
  'The Valley', 'Tilal Al Ghaf', 'The Springs', 'The Meadows', 'The Lakes', 'Emirates Hills', 'The Greens', 'The Views', 'Jumeirah Islands',
  'Jumeirah Park', 'Jumeirah Golf Estates', 'Victory Heights', 'Mohammed Bin Rashid City (MBR City)', 'Sobha Hartland', 'Sobha Hartland 2',
  'District One (MBR City)', 'Meydan', 'Nad Al Sheba', 'Al Jaddaf', 'Culture Village', 'Dubai Healthcare City', 'Oud Metha', 'Bur Dubai',
  'Karama', 'Deira', 'Al Rigga', 'Al Nahda', 'Al Qusais', 'Mirdif', 'Al Warqa', 'Mizhar', 'Dubai Festival City', 'Ras Al Khor',
  'Dubai Investments Park (DIP)', 'Dubai South', 'Emaar South', 'Expo City Dubai', 'Al Satwa', 'Al Wasl', 'Al Safa', 'Al Manara',
  'Pearl Jumeirah', 'Port de La Mer', 'Dubai Maritime City', 'Mina Rashid', 'Dubai Islands', 'Palm Jebel Ali', 'Al Habtoor City',
  'Living Legends', 'Majan', 'Liwan', 'Wadi Al Safa', 'Arjan', 'Al Barari', 'Sustainable City', 'Cherrywoods',
  'Reem (Mira / Mira Oasis)', 'Dubai Harbour', 'Nad Al Hamar', 'Al Mamzar', 'Umm Ramool',
  // Towers and buildings
  'Marina Gate, Dubai Marina', 'Cayan Tower, Dubai Marina', 'Princess Tower, Dubai Marina', 'Elite Residence, Dubai Marina',
  'Marina Promenade, Dubai Marina', 'Emaar 6 Towers, Dubai Marina', 'Damac Heights, Dubai Marina', 'Sparkle Towers, Dubai Marina',
  'Burj Khalifa, Downtown Dubai', 'Address Downtown, Downtown Dubai', 'Burj Vista, Downtown Dubai', 'Boulevard Point, Downtown Dubai',
  'Opera Grand, Downtown Dubai', 'South Ridge, Downtown Dubai', '29 Boulevard, Downtown Dubai', 'Act One | Act Two, Downtown Dubai',
  'Executive Towers, Business Bay', 'Paramount Tower, Business Bay', 'Damac Towers by Paramount, Business Bay', 'Peninsula, Business Bay',
  'Bay Square, Business Bay', 'Churchill Towers, Business Bay', 'Index Tower, DIFC', 'Central Park Towers, DIFC', 'Liberty House, DIFC',
  'Shoreline Apartments, Palm Jumeirah', 'Atlantis The Royal, Palm Jumeirah', 'One Palm, Palm Jumeirah', 'Tiara Residences, Palm Jumeirah',
  'Golden Mile, Palm Jumeirah', 'Bloom Towers, JVC', 'Belgravia, JVC', 'Binghatti Stars, JVC', 'Bluewaters Residences, Bluewaters Island',
  'Creek Rise, Dubai Creek Harbour', 'Creek Gate, Dubai Creek Harbour', 'Harbour Views, Dubai Creek Harbour', 'Sunrise Bay, Emaar Beachfront',
  'Beach Vista, Emaar Beachfront', 'Park Heights, Dubai Hills Estate', 'Collective, Dubai Hills Estate', 'Acacia, Dubai Hills Estate',
  'Lake Terrace, JLT', 'Goldcrest Views, JLT', 'Saba Tower, JLT', 'Rimal, JBR', 'Shams, JBR', 'Murjan, JBR', 'Sadaf, JBR', 'Bahar, JBR',
  'Amna Tower, Al Habtoor City', 'Azizi Riviera, Meydan', 'Sobha Creek Vistas, Sobha Hartland', 'Wilton Park Residences, MBR City',
  'Al Ghurair Centre, Deira', 'Dubai Mall, Downtown Dubai', 'Mall of the Emirates, Al Barsha', 'Ibn Battuta Mall, Jebel Ali', 'Dubai Marina Mall',
  'City Centre Mirdif', 'Dubai Hills Mall', 'Nakheel Mall, Palm Jumeirah', 'Dubai Festival City Mall', 'Dubai Outlet Mall',
]
