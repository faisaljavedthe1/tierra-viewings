import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Status } from '../lib/types'

/* ---------- toasts ---------- */
type Kind = 'ok' | 'err' | 'info'
interface T { id: number; text: string; kind: Kind; link?: { href: string; label: string } }
const ToastCtx = createContext<(text: string, kind?: Kind, link?: T['link']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const id = useRef(0)
  const push = useCallback((text: string, kind: Kind = 'info', link?: T['link']) => {
    const t = { id: ++id.current, text, kind, link }
    setItems(x => [...x.slice(-3), t])
    setTimeout(() => setItems(x => x.filter(y => y.id !== t.id)), link ? 20_000 : 4500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {items.map(t => (
          <div key={t.id} role={t.kind === 'err' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${t.kind === 'err' ? 'bg-red-600' : t.kind === 'ok' ? 'bg-emerald-600' : 'bg-shell'}`}>
            <span className="flex-1">{t.text}</span>
            {t.link && <a href={t.link.href} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/20 px-3 py-1 font-semibold whitespace-nowrap">{t.link.label}</a>}
            <button aria-label="Dismiss" onClick={() => setItems(x => x.filter(y => y.id !== t.id))} className="opacity-70">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' | 'danger' | 'ok'; busy?: boolean; size?: 'sm' | 'md' }
export function Button({ variant = 'gold', busy, size = 'md', className = '', children, disabled, ...p }: BtnProps) {
  const v = {
    gold: 'gold-grad text-white shadow-[0_4px_14px_rgba(192,123,30,.35)] hover:brightness-105',
    ghost: 'border border-line2 bg-surface text-fg hover:bg-bg2',
    danger: 'bg-red-600/10 text-red-600 hover:bg-red-600/15 dark:text-red-400',
    ok: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }[variant]
  const s = size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2.5 text-sm'
  return (
    <button {...p} disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 ${s} ${v} ${className}`}>
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  )
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`page-in max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 shadow-2xl md:rounded-3xl ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-2 text-fg2 hover:bg-bg2">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, error, children, required, full }: { label: string; error?: string; children: ReactNode; required?: boolean; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'col-span-2' : ''}`}>
      <span className="text-[13px] font-semibold text-fg2">{label}{required && <span className="text-gold"> *</span>}</span>
      {children}
      {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
    </label>
  )
}

/* ---------- status ---------- */
export const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', confirmed: 'Confirmed', rescheduled: 'Rescheduled', cancelled: 'Cancelled', completed: 'Completed' }
const STATUS_CLS: Record<Status, string> = {
  pending: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  confirmed: 'bg-blue-600/12 text-blue-700 dark:text-blue-400',
  rescheduled: 'bg-violet-600/12 text-violet-700 dark:text-violet-400',
  cancelled: 'bg-red-600/12 text-red-700 dark:text-red-400',
  completed: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
}
export const StatusPill = ({ s }: { s: Status }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>

export function Empty({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 px-6 py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <h3 className="mt-2 font-bold">{title}</h3>
      {text && <p className="max-w-xs text-sm text-fg2">{text}</p>}
    </div>
  )
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold tracking-wide text-fg3 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {note && <div className="text-xs text-fg2">{note}</div>}
    </div>
  )
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
      {options.map(o => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition ${value === o.v ? 'gold-grad text-white' : 'border border-line2 bg-surface text-fg2'}`}>{o.l}</button>
      ))}
    </div>
  )
}
