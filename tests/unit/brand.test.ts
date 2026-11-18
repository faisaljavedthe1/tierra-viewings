// The logo must be sharp (vector) and the home-screen icon must be told apart from other Tierra apps.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const pub = (f: string) => `public/${f}`
const pngSize = (f: string) => { const b = readFileSync(pub(f)); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

describe('brand assets', () => {
  it('logo is vector, not a blown-up picture', () => {
    for (const f of ['wordmark-brown.svg', 'wordmark-cream.svg', 'mark.svg']) {
      const s = readFileSync(pub(f), 'utf8')
      expect(s, f).toMatch(/^<svg [^>]*viewBox=/)
      expect(s, f).not.toMatch(/<image|base64/)
    }
    expect(existsSync(pub('wordmark-brown@2x.png'))).toBe(false)
  })
  it('home-screen icons exist at the right sizes, with fresh names so phones pick them up', () => {
    const cfg = readFileSync('vite.config.ts', 'utf8')
    for (const [f, n] of [['icon-v2-192.png', 192], ['icon-v2-512.png', 512], ['icon-v2-maskable-512.png', 512], ['apple-touch-icon-v2.png', 180]] as const) {
      expect(pngSize(f), f).toEqual([n, n])
    }
    expect(cfg).toContain('icon-v2-512.png')
    expect(readFileSync('index.html', 'utf8')).toContain('apple-touch-icon-v2.png')
  })
  it('the Viewings icon carries the car badge that other Tierra apps do not have', () => {
    expect(readFileSync(pub('icon.svg'), 'utf8')).toMatch(/M9 17h6/) // the car's outline
  })
})
