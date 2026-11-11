/* Drum wheel like the Android app: native momentum + snap, items tilt and fade with the distance from the centre,
   a light haptic tick on every step. Only a finger/mouse scroll reports a value (after it settles), so a value set
   from outside never loops back. Tap the centre value to type an exact number. */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { haptic } from '../tg'

const H = 46
const VISIBLE = 5

export function Wheel({ count, index, label, onPick, onCenterClick }: {
  count: number; index: number; label: (i: number) => string; onPick: (i: number) => void; onCenterClick?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const user = useRef(false)
  const settle = useRef(0)
  const tick = useRef(index)
  const mounted = useRef(false)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const indexRef = useRef(index)
  indexRef.current = index

  const paint = () => {
    const el = ref.current
    if (!el) return
    const pos = el.scrollTop / H
    const c = Math.round(pos)
    const items = el.children
    for (let i = Math.max(0, c - 6); i <= Math.min(count - 1, c + 6); i++) {
      const it = items[i] as HTMLElement | undefined
      if (!it) continue
      const d = i - pos
      const a = Math.min(Math.abs(d), 3)
      it.style.transform = `perspective(320px) rotateX(${(-d * 20).toFixed(1)}deg) scale(${(1 - a * 0.1).toFixed(3)})`
      it.style.opacity = (1 - a * 0.3).toFixed(2)
      it.classList.toggle('c', i === c)
    }
  }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || user.current) return
    const top = index * H
    if (Math.abs(el.scrollTop - top) > 1) el.scrollTo({ top, behavior: mounted.current ? 'smooth' : 'auto' })
    tick.current = index
    mounted.current = true
    paint()
  }, [index, count]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    paint()
    const c = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / H)))
    if (user.current && c !== tick.current) { tick.current = c; haptic.tap() }
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      if (!user.current) return
      user.current = false
      const fin = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / H)))
      if (fin !== indexRef.current) pickRef.current(fin)
    }, 150)
  }
  const touch = () => { user.current = true }

  return (
    <div className="wheel" style={{ height: H * VISIBLE }}>
      <div className="wheel-band" />
      <div ref={ref} className="wheel-list" onScroll={onScroll} onTouchStart={touch} onPointerDown={touch} onWheel={touch}
        style={{ paddingTop: H * 2, paddingBottom: H * 2 }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="wheel-item" style={{ height: H }} onClick={() => {
            const el = ref.current
            if (!el) return
            if (i === Math.round(el.scrollTop / H)) onCenterClick?.()
            else { user.current = true; el.scrollTo({ top: i * H, behavior: 'smooth' }) }
          }}>{label(i)}</div>
        ))}
      </div>
    </div>
  )
}
