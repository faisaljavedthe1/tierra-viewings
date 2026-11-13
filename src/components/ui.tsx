import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from 'lucide-react'
import type { Status } from '../lib/types'

/* ---------- brand ---------- */
const MARK = 'M0 0h51v5H0zM0 5h5v5H0zM0 10h28v5H0zM23 15h5v22h-5zM32 10h19v5H32zM46 15h5v4h-5zM32 19h19v5H32zM32 24h5v18h-5zM14 42h23v5H14zM14 24h5v18h-5zM0 19h19v5H0z'
export const Mark = ({ className = 'h-7 w-auto', title = 'Tierra Properties' }: { className?: string; title?: string }) => (
  <svg viewBox="0 0 51 47" className={`fill-brand ${className}`} role="img" aria-label={title}><path d={MARK} /></svg>
)
/** "tierra PROPERTIES" lettering from the official logo (brown on light, cream on dark). */
export const Wordmark = ({ className = 'h-10 w-auto' }: { className?: string }) => (
  <>
    <img src="/wordmark-brown@2x.png" alt="Tierra Properties" className={`${className} dark:hidden`} />
    <img src="/wordmark-cream@2x.png" alt="Tierra Properties" className={`${className} hidden dark:block`} />
  </>
)

/* ---------- toasts ---------- */
type Kind = 'ok' | 'err' | 'info'
interface T { id: number; text: string; kind: Kind; link?: { href: string; label: string } }
const ToastCtx = createContext<(text: string, kind?: Kind, link?: T['link']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
const TOAST_ICON: Record<Kind, LucideIcon> = { ok: CheckCircle2, err: XCircle, info: Info }

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
        {items.map(t => {
          const Icon = TOAST_ICON[t.kind]
          return (
            <div key={t.id} role={t.kind === 'err' ? 'alert' : 'status'}
              className="sheet-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-brand-deep px-4 py-3 text-[14.5px] text-on-brand shadow-xl dark:bg-surface dark:text-ink dark:ring-1 dark:ring-line2">
              <Icon className={`h-5 w-5 shrink-0 ${t.kind === 'err' ? 'text-[#F2A196]' : t.kind === 'ok' ? 'text-[#9BD8B8]' : 'opacity-70'}`} aria-hidden />
              <span className="flex-1">{t.text}</span>
              {t.link && <a href={t.link.href} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold whitespace-nowrap">{t.link.label}</a>}
              <button aria-label="Dismiss" onClick={() => setItems(x => x.filter(y => y.id !== t.id))} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: LucideIcon }
export function Button({ variant = 'primary', busy, size = 'md', icon: Icon, className = '', children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-brand text-on-brand hover:bg-brand-deep shadow-sm',
    secondary: 'border border-line2 bg-surface text-ink hover:bg-paper2',
    ghost: 'text-ink2 hover:bg-paper2 hover:text-ink',
    danger: 'text-[var(--s-cancelled)] bg-[var(--s-cancelled-bg)] hover:brightness-95',
    success: 'bg-[var(--s-confirmed)] text-white hover:brightness-110 dark:text-[#10241B]',
  }[variant]
  const s = size === 'sm' ? 'h-9 px-3 text-[13.5px] gap-1.5' : size === 'lg' ? 'h-12 px-5 text-base gap-2' : 'h-11 px-4 text-[15px] gap-2'
  return (
    <button {...p} disabled={disabled || busy}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 ${s} ${v} ${className}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-[18px] w-[18px]" aria-hidden /> : null}
      {children}
    </button>
  )
}

/* ---------- sheet (bottom sheet on phones, dialog on larger screens) ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k); document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,24,20,.45)] backdrop-blur-[2px] md:items-center md:p-6" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`sheet-in safe-b max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] bg-paper shadow-2xl md:rounded-[22px] ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'}`}>
        <div className="sticky top-0 z-10 bg-paper/95 px-5 pt-2.5 pb-3 backdrop-blur">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line2 md:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button aria-label="Close" onClick={onClose} className="-mr-2 rounded-full p-2 text-ink2 hover:bg-paper2"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, error, children, required, full, hint }: { label: string; error?: string; children: ReactNode; required?: boolean; full?: boolean; hint?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${full ? 'col-span-2' : ''}`}>
      <span className="text-[13px] font-medium text-ink2">{label}{required && <span className="text-brass"> *</span>}</span>
      {children}
      {error ? <span className="text-[13px] font-medium text-[var(--s-cancelled)]">{error}</span> : hint ? <span className="text-xs text-ink3">{hint}</span> : null}
    </label>
  )
}

/* ---------- status ---------- */
export const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', confirmed: 'Confirmed', rescheduled: 'Rescheduled', cancelled: 'Cancelled', completed: 'Completed' }
export const StatusPill = ({ s }: { s: Status }) => <span className={`status st-${s}`}>{STATUS_LABEL[s]}</span>

export function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-line2 px-6 py-12 text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon className="h-6 w-6" aria-hidden /></div>
      <h3 className="font-semibold">{title}</h3>
      {text && <p className="max-w-xs text-sm text-ink2">{text}</p>}
    </div>
  )
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[26px] leading-tight font-semibold">{value}</div>
      {note && <div className="text-xs text-ink2">{note}</div>}
    </div>
  )
}

/** Segmented filter. */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
      {options.map(o => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={`h-9 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap transition ${value === o.v ? 'bg-brand text-on-brand' : 'border border-line bg-surface text-ink2 hover:text-ink'}`}>{o.l}</button>
      ))}
    </div>
  )
}

export function PageHead({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>{eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}<h1 className="text-[26px] leading-tight font-semibold">{title}</h1></div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
