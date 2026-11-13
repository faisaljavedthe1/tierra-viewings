// iPhones often report location permission as "prompt" even after refusing it silently, so the app
// also remembers what actually happened the last time it asked (bug seen on Gagan's iPhone, 13 Nov).
import { describe, expect, it } from 'vitest'
import { effectiveGeo } from '../../src/lib/setup'

describe('effective location permission', () => {
  it('trusts a clear answer from the browser', () => {
    expect(effectiveGeo('granted', null)).toBe('granted')
    expect(effectiveGeo('denied', 'ok')).toBe('denied')
  })
  it('when the browser is vague, uses what happened last time', () => {
    expect(effectiveGeo('prompt', 'denied')).toBe('denied')   // silently refused → show the fix-it steps
    expect(effectiveGeo('unknown', 'denied')).toBe('denied')
    expect(effectiveGeo('prompt', 'ok')).toBe('granted')      // worked before → don't block the driver
    expect(effectiveGeo('unknown', 'ok')).toBe('granted')
    expect(effectiveGeo('prompt', null)).toBe('prompt')
  })
})
