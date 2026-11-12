// After `vite build`: put the Supabase host into the Content-Security-Policy in dist/_headers.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env }
const host = new URL(env.VITE_SUPABASE_URL ?? 'https://invalid.supabase.co').host
const f = 'dist/_headers'
writeFileSync(f, readFileSync(f, 'utf8').replaceAll('__SUPABASE_HOST__', host))
console.log('CSP connect-src →', host)
