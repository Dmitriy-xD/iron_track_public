import { useId, useState } from 'react'
import { CatalogExercise, muscleTitle } from '../analytics/catalog'
import { haptic } from '../tg'
import { Art, Num } from './motion'

export { Modal, SheetHeader } from './motion'

export function Kpi({ label, value, hint, accent, art }: { label: string; value: string; hint?: string; accent?: boolean; art?: string }) {
  return (
    <div className={'kpi' + (accent ? ' accent' : '')}>
      {art && <Art name={art} size={44} className="kpi-art" />}
      <div className="l">{label}</div><div className="v"><Num text={value} /></div>{hint && <div className="h">{hint}</div>}
    </div>
  )
}

/** Segmented control; the highlight slides to the chosen option. */
export function Seg<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const i = options.findIndex(([v]) => v === value)
  return (
    <div className="seg" style={{ ['--n' as string]: options.length, ['--i' as string]: Math.max(i, 0) }}>
      {i >= 0 && <i className="seg-thumb" />}
      {options.map(([v, l]) => <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => { if (v !== value) { haptic.tap(); onChange(v) } }}>{l}</button>)}
    </div>
  )
}

export function MuscleLine({ ex }: { ex: CatalogExercise }) {
  if (ex.primary === 'OTHER') return <div className="small danger">⚠ Не указано, что качает</div>
  return (
    <div className="small">
      <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{muscleTitle(ex.primary)}</span>
      {ex.secondary.length > 0 && <span className="muted small"> + помогают: {ex.secondary.map(m => muscleTitle(m).toLowerCase()).join(', ')}</span>}
    </div>
  )
}

/** Vertical bars. Tap a bar to select it: it lights up and shows its value and label; the last one is selected first. */
export function BarChart({ values, labels, format, height = 140 }: { values: number[]; labels: string[]; format: (v: number) => string; height?: number }) {
  const max = Math.max(...values, 0) || 1
  // the choice belongs to these labels: another period or exercise starts again from the last bar
  const sig = labels.join('|')
  const [sel, setSel] = useState<{ sig: string; i: number } | null>(null)
  const cur = sel && sel.sig === sig && sel.i < values.length ? sel.i : values.length - 1
  const pick = (i: number) => { if (i !== cur) haptic.tap(); setSel({ sig, i }) }
  return (
    <div className="bar-chart">
      <div className="chart-pick"><b><Num key={cur} text={format(values[cur] ?? 0)} ms={350} /></b><span className="muted small">{labels[cur]}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height }}>
        {values.map((v, i) => (
          <button key={i} className="bar-hit" onClick={() => pick(i)} aria-label={`${labels[i]}: ${format(v)}`}>
            <div className={'bar' + (i === cur ? ' last' : '')} style={{
              height: v > 0 ? `${Math.max(v / max, 0.02) * 88}%` : '1%', animationDelay: `${i * 35}ms`
            }} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {labels.map((l, i) => <div key={i} className={'bar-label' + (i === cur ? ' on' : '')}>{labels.length <= 8 || i % 2 === (labels.length - 1) % 2 || i === cur ? l : ''}</div>)}
      </div>
    </div>
  )
}

/** Line chart with area fill (SVG). Tap or drag across it to pick a point. */
export function LineChart({ values, start, end, format, color = 'var(--orange)', labels }: { values: number[]; start: string; end: string; format: (v: number) => string; color?: string; labels?: string[] }) {
  const W = 300, H = 120
  const gid = 'lg' + useId().replace(/:/g, '')
  const [sel, setSel] = useState<number | null>(null)
  if (!values.length) return null
  const min = Math.min(...values), max = Math.max(...values)
  const pad = max - min < 1e-9 ? 1 : (max - min) * 0.15
  const lo = min - pad, hi = max + pad
  const x = (i: number) => (values.length === 1 ? W / 2 : (W * i) / (values.length - 1))
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const cur = sel != null && sel < values.length ? sel : values.length - 1
  const pickAt = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const i = values.length === 1 ? 0 : Math.round(((clientX - r.left) / r.width) * (values.length - 1))
    const c = Math.min(values.length - 1, Math.max(0, i))
    if (c !== cur) haptic.tap()
    setSel(c)
  }
  return (
    <div>
      <div className="chart-pick"><b style={{ color }}><Num key={cur} text={format(values[cur])} ms={350} /></b>
        <span className="muted small">{labels?.[cur] ?? (cur === values.length - 1 ? 'сейчас' : '')} · макс {format(max)}</span></div>
      <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150, overflow: 'visible', margin: '8px 0', touchAction: 'pan-y', cursor: 'pointer' }} preserveAspectRatio="none"
        onClick={e => pickAt(e.clientX, e.currentTarget)} onTouchMove={e => pickAt(e.touches[0].clientX, e.currentTarget)}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3].map(g => <line key={g} x1="0" x2={W} y1={(H * g) / 3} y2={(H * g) / 3} style={{ stroke: 'rgb(var(--fg) / .06)' }} strokeDasharray="4 4" />)}
        <path d={`${line} L${x(values.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${gid})`} />
        <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} stroke={color} strokeOpacity=".45" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="pick-line" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === cur ? 6 : 3} fill={i === cur ? '#fff' : color} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" className="pt" />)}
      </svg>
      <div className="between small muted"><span>{start}</span><span>{end}</span></div>
    </div>
  )
}

/** Stacked direct (bright) + indirect×½ (dim) bar with the 10–20 target zone. */
export function MuscleBar({ direct, indirectHalf, max }: { direct: number; indirectHalf: number; max: number }) {
  const pct = (v: number) => `${(v / max) * 100}%`
  return (
    <div className="mbar">
      <div className="zone" style={{ left: pct(10), width: pct(10) }} />
      <div className="fill soft" style={{ width: pct(direct + indirectHalf) }} />
      <div className="fill" style={{ width: pct(direct) }} />
    </div>
  )
}
