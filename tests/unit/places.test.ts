// Place search for the booking form: free sources only (OpenStreetMap via Nominatim + Photon), a Dubai list,
// and pasted Google Maps links / coordinates. Written before src/lib/places.ts.
import { describe, expect, it } from 'vitest'
import { DUBAI_PLACES, curatedHits, mapsUrl, mergeHits, parsePlace, photonLabel } from '../../src/lib/places'

describe('pasted locations', () => {
  it('recognises coordinates in common formats', () => {
    expect(parsePlace('25.0805, 55.1403')).toEqual({ kind: 'coords', lat: 25.0805, lng: 55.1403 })
    expect(parsePlace(' 25.0805,55.1403 ')).toEqual({ kind: 'coords', lat: 25.0805, lng: 55.1403 })
    expect(parsePlace('https://www.google.com/maps/place/Marina+Gate/@25.0849,55.1452,17z')).toEqual({ kind: 'coords', lat: 25.0849, lng: 55.1452 })
    expect(parsePlace('https://maps.google.com/?q=25.2,55.27')).toEqual({ kind: 'coords', lat: 25.2, lng: 55.27 })
  })
  it('keeps short share links as links (they open in Google Maps for the driver)', () => {
    expect(parsePlace('https://maps.app.goo.gl/AbC123')).toEqual({ kind: 'link', url: 'https://maps.app.goo.gl/AbC123' })
    expect(parsePlace('see https://goo.gl/maps/xyz please').kind).toBe('link')
  })
  it('ignores numbers that are not UAE coordinates and plain text', () => {
    expect(parsePlace('Tower 2, 45.5, 3').kind).toBe('text')
    expect(parsePlace('Marina Gate 1').kind).toBe('text')
    expect(parsePlace('91.0, 55.1').kind).toBe('text') // impossible latitude
  })
  it('never turns a non-maps link into something clickable', () => {
    expect(parsePlace('https://evil.example/maps.app.goo.gl').kind).toBe('text')
    expect(parsePlace('javascript:alert(1)').kind).toBe('text')
  })
  it('builds a Google Maps link the driver can tap, for any location', () => {
    expect(mapsUrl('25.0805, 55.1403')).toBe('https://www.google.com/maps/search/?api=1&query=25.0805%2C55.1403')
    expect(mapsUrl('https://maps.app.goo.gl/AbC123')).toBe('https://maps.app.goo.gl/AbC123')
    expect(mapsUrl('Marina Gate 1, Dubai Marina')).toBe('https://www.google.com/maps/search/?api=1&query=Marina%20Gate%201%2C%20Dubai%20Marina')
    expect(mapsUrl('  ')).toBeNull()
  })
})

describe('suggestions', () => {
  it('has a solid Dubai list without duplicates', () => {
    expect(DUBAI_PLACES.length).toBeGreaterThan(100)
    expect(new Set(DUBAI_PLACES.map(p => p.toLowerCase())).size).toBe(DUBAI_PLACES.length)
  })
  it('finds Dubai places by any word, ignoring case and punctuation', () => {
    expect(curatedHits('jvc')[0]).toMatch(/Jumeirah Village Circle/)
    expect(curatedHits('marina gate')).toContain('Marina Gate, Dubai Marina')
    expect(curatedHits('damac hills').some(h => /DAMAC Hills/.test(h))).toBe(true)
    expect(curatedHits('xy')).toEqual([])
  })
  it('labels Photon results like an address', () => {
    expect(photonLabel({ name: 'Marina Gate 1', street: 'King Salman bin Abdulaziz Al Saud St', district: 'Dubai Marina', city: 'Dubai' }))
      .toBe('Marina Gate 1, King Salman bin Abdulaziz Al Saud St, Dubai Marina, Dubai')
    expect(photonLabel({ name: 'Dubai', city: 'Dubai' })).toBe('Dubai')
    expect(photonLabel({ housenumber: '12', street: 'Al Wasl Rd', city: 'Dubai' })).toBe('12 Al Wasl Rd, Dubai')
  })
  it('merges sources, our list first, without near-duplicates, max 8', () => {
    const m = mergeHits([['Marina Gate, Dubai Marina'], ['marina gate, dubai marina', 'Marina Gate 1, Dubai'], ['A', 'B', 'C', 'D', 'E', 'F', 'G']])
    expect(m[0]).toBe('Marina Gate, Dubai Marina')
    expect(m.filter(x => x.toLowerCase() === 'marina gate, dubai marina')).toHaveLength(1)
    expect(m).toHaveLength(8)
  })
})

describe('pen-test 13 Nov: look-alike map domains', () => {
  it('only real Google Maps hosts become links', () => {
    for (const bad of ['https://google.evil.com/maps/x', 'https://google.com.evil.io/maps/x', 'https://maps.app.goo.gl.evil.io/a', 'https://evilgoo.gl/maps/a'])
      expect(parsePlace(bad).kind, bad).toBe('text')
    expect(parsePlace('https://www.google.ae/maps/place/X/@25.1,55.2,17z').kind).toBe('coords')
    expect(parsePlace('https://www.google.co.uk/maps/place/X').kind).toBe('link')
  })
})
