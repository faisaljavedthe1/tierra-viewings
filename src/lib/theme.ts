export type Theme = 'system' | 'light' | 'dark'
const KEY = 'tv-theme'
const mq = () => matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
export function applyTheme(t = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && mq().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#07080F' : '#0A0C18')
}
export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* private mode */ }
  applyTheme(t)
}
export function watchSystemTheme() { mq().addEventListener('change', () => applyTheme()) }
