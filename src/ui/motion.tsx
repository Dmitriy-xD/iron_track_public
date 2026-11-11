/* Motion kit: bottom sheets with enter/leave animations, in-app dialogs (native confirm/alert are unreliable inside
   Telegram), toasts and numbers that count up. Animations use only transform/opacity so they stay smooth on phones. */
import { ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../tg'
import { Icon } from './icons'

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** When the element unmounts, a copy of it stays for [ms] and plays the `.leaving` animation — so every close is
 *  smooth even though the parent simply stops rendering it. */
export function useLeaveGhost<T extends HTMLElement>(ref: RefObject<T>, ms = 260) {
  useLayoutEffect(() => {
    const el = ref.current
    const born = performance.now()
    return () => {
      if (!el || reducedMotion() || performance.now() - born < 60) return // StrictMode's instant remount
      const ghost = el.cloneNode(true) as HTMLElement
      ghost.classList.add('leaving')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.style.pointerEvents = 'none'
      document.body.appendChild(ghost)
      window.setTimeout(() => ghost.remove(), ms)
    }
  }, [ref, ms])
}

let locks = 0
function useScrollLock() {
  useEffect(() => {
    if (locks++ === 0) document.documentElement.classList.add('locked')
    return () => { if (--locks === 0) document.documentElement.classList.remove('locked') }
  }, [])
}

/** Bottom sheet on phones, centred card on wide screens. Swipe the handle down or tap outside to close. */
export function Modal({ onClose, children, className = '' }: { onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  useLeaveGhost(ref)
  useScrollLock()
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const start = (y: number) => { if ((sheet.current?.scrollTop ?? 0) <= 0) drag.current = { y, dy: 0 } }
  const move = (y: number) => {
    const d = drag.current
    if (!d || !sheet.current) return
    d.dy = Math.max(0, y - d.y)
    sheet.current.style.transition = 'none'
    sheet.current.style.transform = `translateY(${d.dy}px)`
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d || !sheet.current) return
    sheet.current.style.transition = ''
    sheet.current.style.transform = ''
    if (d.dy > 90) onClose()
  }
  return createPortal(
    <div ref={ref} className={'modal ' + className} onClick={onClose}>
      <div ref={sheet} className="sheet" onClick={e => e.stopPropagation()}
        onTouchStart={e => start(e.touches[0].clientY)} onTouchMove={e => move(e.touches[0].clientY)} onTouchEnd={end}>
        <div className="grab" />
        {children}
      </div>
    </div>,
    document.body
  )
}

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon.close /></button></div>
}

// ---------------------------------------------------------------- dialogs

interface DialogReq { title: string; text?: string; ok: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void }
let showDialog: ((d: DialogReq) => void) | null = null

/** In-app replacement for window.confirm. */
export function ask(title: string, opts: { text?: string; ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => {
    if (!showDialog) return resolve(window.confirm(title))
    showDialog({ title, text: opts.text, ok: opts.ok ?? 'Да', cancel: opts.cancel ?? 'Отмена', danger: opts.danger, resolve })
  })
}
/** In-app replacement for window.alert. */
export function tell(title: string, text?: string): Promise<void> {
  return new Promise(resolve => {
    if (!showDialog) { window.alert(title); return resolve() }
    showDialog({ title, text, ok: 'Понятно', resolve: () => resolve() })
  })
}

export function DialogHost() {
  const [d, setD] = useState<DialogReq | null>(null)
  useEffect(() => { showDialog = setD; return () => { showDialog = null } }, [])
  if (!d) return null
  const done = (v: boolean) => { setD(null); d.resolve(v) }
  return (
    <Modal onClose={() => done(false)} className="dialog">
      <h2>{d.title}</h2>
      {d.text && <p className="muted">{d.text}</p>}
      <div className="dialog-actions">
        {d.cancel && <button className="btn ghost" onClick={() => done(false)}>{d.cancel}</button>}
        <button className={'btn' + (d.danger ? ' danger-btn' : '')} onClick={() => { haptic.tap(); done(true) }}>{d.ok}</button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- toast

export function Toast({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLeaveGhost(ref, 220)
  return createPortal(<div ref={ref} className="toast" role="status">{text}</div>, document.body)
}

// ---------------------------------------------------------------- numbers

const NUM = /\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?/

/** Renders [text] and counts its first number up from 0 the first time it appears (e.g. "12 400 кг", "91%"). */
export function Num({ text, ms = 700 }: { text: string; ms?: number }) {
  const m = NUM.exec(text)
  const raw = m ? m[0] : ''
  const target = raw ? Number(raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')) : 0
  const decimals = raw.includes('.') || raw.includes(',') ? raw.split(/[.,]/)[1].length : 0
  const grouped = decimals === 0 && target >= 10000
  const [v, setV] = useState(() => (reducedMotion() || !raw ? target : 0))
  const from = useRef(v)
  useEffect(() => {
    if (!raw || reducedMotion()) { setV(target); return }
    const a = from.current, t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const cur = a + (target - a) * e
      setV(cur)
      from.current = cur
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, raw, ms])
  if (!m) return <>{text}</>
  let s = v.toFixed(decimals)
  if (grouped) s = Number(s).toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return <>{text.slice(0, m.index)}{s}{text.slice(m.index + raw.length)}</>
}

/** 3D art from /img (generated renders with a transparent background). */
export function Art({ name, size, className = '' }: { name: string; size: number; className?: string }) {
  return <img className={'art ' + className} src={`img/${name}.webp`} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain' }} />
}
