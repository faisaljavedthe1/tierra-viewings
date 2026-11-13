// Renders public/icon.svg (Tierra T mark on brand brown) to the PNG sizes phones and the PWA manifest need.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const b = await chromium.launch()
for (const [s, name, full] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png', true], [512, 'icon-maskable-512.png', true]]) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  // Apple and Android "maskable" icons are cropped by the phone, so fill the corners.
  const art = full ? svg.replace('rx="112"', 'rx="0"') : svg
  await p.setContent(`<style>*{margin:0}</style>${art.replace('<svg ', `<svg width="${s}" height="${s}" `)}`)
  await p.screenshot({ path: `public/${name}`, omitBackground: true })
}
await b.close()
