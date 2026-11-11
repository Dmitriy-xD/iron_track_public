import { useEffect, useMemo, useRef, useState } from 'react'
import { muscleTitle } from '../analytics/catalog'
import { formatShort, isoDow, localDay, today as todayDay, weekStart } from '../analytics/dates'
import { fmt1, formatKg } from '../analytics/metrics'
import { Note, buildWeeklyReview } from '../analytics/weeklyReview'
import { CoachPage } from '../analytics/coaching'
import { useStore } from '../data/store'
import { planExercises, planGoals } from '../data/types'
import { MuscleBar, Seg } from './common'
import { Icon } from './icons'
import { Art, useLeaveGhost } from './motion'

const BG = ['#2A1A4A', '#123A2A', '#4A1A22', '#3A2312', '#12304A', '#4A3A12']

/** Full-screen weekly story: tap right / left (or arrow keys, swipe); 6 slides plus the recommendation pages. */
export function Story({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const t = todayDay()
  const thisWeek = weekStart(t)
  const [week, setWeek] = useState(isoDow(t) <= 2 ? thisWeek - 7 : thisWeek)
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const ref = useRef<HTMLDivElement>(null)
  useLeaveGhost(ref, 260)
  const r = useMemo(() => buildWeeklyReview({
    sets: store.logged,
    sessions: store.db.sessions.map(s => [s.startedAt, s.finishedAt] as [number, number | null]),
    plan: store.db.plan.map(p => ({ dayOfWeek: p.dayOfWeek, title: p.title, exercises: planExercises(p), goals: planGoals(p) })),
    resolve: store.resolve, weekStart: week, today: t, dayOf: localDay,
    bodyweightDays: store.db.measurements.filter(m => m.weightGrams != null).map(m => m.epochDay),
    bodyweightKg: (() => { const w = store.db.measurements.filter(m => m.weightGrams != null).at(-1); return w ? w.weightGrams! / 1000 : null })()
  }), [store, week, t])
  const PAGES = 6 + r.coaching.length
  const next = () => { if (page === PAGES - 1) onClose(); else { setDir('fwd'); setPage(p => p + 1) } }
  const prev = () => { setDir('back'); setPage(p => Math.max(0, p - 1)) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === ' ') next(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  let touchX = 0

  const notes = (art: string, title: string, list: Note[], color: string, empty: string) => (
    <>
      <Art name={art} size={84} className="slide-art" /><h1>{title}</h1>
      {!list.length ? <p style={{ fontSize: 17, opacity: .85 }}>{empty}</p> : list.map((n, i) => (
        <div key={i} className="note"><i style={{ background: color }} /><div><b style={{ fontSize: 17 }}>{n.text}</b>{n.detail && <div style={{ opacity: .7, whiteSpace: 'pre-line' }}>{n.detail}</div>}</div></div>
      ))}
    </>
  )

  const max = Math.max(20, ...r.muscles.map(m => m.effective)) * 1.05
  const slides = [
    <>
      <div onClick={e => e.stopPropagation()}><Seg options={[[thisWeek - 7, 'Прошлая неделя'], [thisWeek, 'Эта неделя']]} value={week} onChange={setWeek} /></div>
      <div className="muted" style={{ marginTop: 16 }}>{formatShort(r.weekStart)} — {formatShort(r.weekEnd)}</div>
      <h1 style={{ fontSize: 34, fontWeight: 900 }}>{r.isCurrentWeek ? 'Неделя в процессе' : 'Итоги недели'}</h1>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
        <svg className="score" width="170" height="170" viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="70" stroke="rgba(255,255,255,.12)" strokeWidth="16" fill="none" />
          <defs><linearGradient id="scoreg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB36B" /><stop offset="1" stopColor="#FF5A1F" /></linearGradient></defs>
          <circle className="arc" cx="85" cy="85" r="70" stroke="url(#scoreg)" strokeWidth="16" fill="none" strokeLinecap="round" strokeDasharray={`${(2 * Math.PI * 70 * r.score) / 100} 999`} transform="rotate(-90 85 85)" style={{ ['--len' as string]: (2 * Math.PI * 70 * r.score) / 100 }} />
          <text x="85" y="88" textAnchor="middle" fill="#fff" fontSize="48" fontWeight="900">{r.score}</text>
          <text x="85" y="112" textAnchor="middle" fill="#9AA0A8" fontSize="13">из 100</text>
        </svg>
      </div>
      <p style={{ textAlign: 'center', fontWeight: 700 }}>{r.score >= 80 ? 'Мощная неделя! 🔥' : r.score >= 55 ? 'Хорошая работа, есть куда расти' : r.workouts === 0 ? 'Тренировок не было — начнём заново 💪' : 'Неделя с пропусками — разберёмся дальше'}</p>
      <div className="grid2">
        <Big l="Тренировки" v={r.plannedDays ? `${r.doneDays}/${r.plannedDays}` : String(r.workouts)} h="по плану" />
        <Big l="Подходы" v={String(r.workingSets)} h={r.previousWorkingSets ? `${r.workingSets >= r.previousWorkingSets ? '+' : '−'}${Math.abs(r.workingSets - r.previousWorkingSets)} к прошлой` : 'нет сравнения'} />
        <Big l="Тоннаж" v={`${formatKg(Math.trunc(r.tonnageGrams / 1000) * 1000)} кг`} h={r.tonnageChangePct != null ? `${r.tonnageChangePct >= 0 ? '+' : ''}${r.tonnageChangePct}% к прошлой` : 'нет сравнения'} />
        <Big l="Время" v={r.avgMinutes != null ? `${r.avgMinutes} мин` : '—'} h="в среднем" />
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>Нажми справа, чтобы листать →</p>
    </>,
    notes('trophy', 'Что получилось', r.good, 'var(--good)', 'Пока нечем похвастаться — запиши тренировку, и здесь появятся успехи.'),
    notes('stopwatch', 'Над чем поработать', r.improve, 'var(--bad)', 'Замечаний нет — отличная неделя!'),
    <>
      <Art name="muscle" size={84} className="slide-art" /><h1>Мышцы недели</h1>
      {!r.muscles.length ? <p>Рабочих подходов не было.</p> : r.muscles.map(v => (
        <div key={v.muscle} className="row" style={{ marginBottom: 10 }}>
          <span style={{ width: 120 }}>{muscleTitle(v.muscle)}</span>
          <div className="grow"><MuscleBar direct={v.direct} indirectHalf={v.indirect * 0.5} max={max} /></div>
          <b style={{ width: 40, textAlign: 'right' }}>{v.effective % 1 === 0 ? v.effective : fmt1(v.effective)}</b>
        </div>
      ))}
      <p className="muted small">Яркое — прямые подходы, бледное — косвенные (×½). Зелёная зона — 10–20 в неделю.</p>
    </>,
    <>
      <Art name="dumbbell" size={84} className="slide-art" /><h1>Лучшее за неделю</h1>
      {!r.topExercises.length ? <p>Рабочих подходов не было.</p> : <>
        <b style={{ color: 'var(--orange)' }}>Больше всего тоннажа</b>
        {r.topExercises.map((s, i) => (
          <div key={s.name} className="row" style={{ margin: '10px 0' }}>
            <span style={{ fontSize: 26 }}>{['🥇', '🥈', '🥉'][i]}</span>
            <div className="grow"><b>{s.name}</b><div className="muted small">{s.workingSets} подх. • макс {formatKg(s.maxWeightGrams)} кг</div></div>
            <b style={{ color: 'var(--orange)' }}>{formatKg(s.tonnageGrams)} кг</b>
          </div>
        ))}
        {r.records.length > 0 && <><b style={{ color: 'var(--orange)', display: 'block', marginTop: 14 }}>🏆 Рекорды (расчётный 1ПМ)</b>
          {r.records.slice(0, 5).map(x => <div key={x.exercise} className="between" style={{ margin: '6px 0' }}><span>{x.exercise}</span><b style={{ color: 'var(--good)' }}>≈{fmt1(x.e1rmKg)} кг{x.previousKg != null ? ` (+${fmt1(x.e1rmKg - x.previousKg)})` : ''}</b></div>)}</>}
      </>}
    </>,
    ...r.coaching.map((c, i) => <CoachSlide key={'c' + i} page={c} index={i + 1} total={r.coaching.length} />),
    notes('chart', 'План на следующую неделю', r.recommendations, 'var(--orange)', 'Продолжай в том же духе.')
  ]

  return (
    <div ref={ref} className="story" style={{ background: `linear-gradient(${BG[page % BG.length]}, var(--bg))` }}
      onTouchStart={e => { touchX = e.touches[0].clientX }}
      onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 60) (dx < 0 ? next() : prev()) }}>
      <div className="top">
        <div className="bars">{Array.from({ length: PAGES }, (_, i) => <div key={i} className={i <= page ? 'on' : ''} />)}</div>
        <div className="between" style={{ marginTop: 6 }}><span className="small" style={{ opacity: .8 }}>IRONTRACK • итоги</span><button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon.close /></button></div>
      </div>
      <div className="body" onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); (e.clientX - rect.left < rect.width / 3 ? prev : next)() }}>
        <div key={page} className={'slide ' + dir}>{slides[page]}</div>
      </div>
    </div>
  )
}

function CoachSlide({ page, index, total }: { page: CoachPage; index: number; total: number }) {
  return (
    <>
      <div className="muted small">Рекомендации {index} из {total} • по твоим данным за 4 недели</div>
      <div style={{ fontSize: 48 }}>{page.emoji}</div><h1 style={{ fontSize: 30 }}>{page.title}</h1>
      {page.facts.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 18, padding: 14, marginBottom: 12 }}>
          <b>📊 Что видно в твоих тренировках</b>
          {page.facts.map((f, i) => <div key={i} style={{ marginTop: 6, opacity: .9 }}>• {f.text}</div>)}
        </div>
      )}
      <b style={{ color: 'var(--good)' }}>✅ Как лучше</b>
      {page.tips.map((n, i) => (
        <div key={i} className="note"><i style={{ background: 'var(--good)' }} /><div><b style={{ fontSize: 17 }}>{n.text}</b>{n.detail && <div style={{ opacity: .7 }}>{n.detail}</div>}</div></div>
      ))}
      <p className="muted small">Это ориентиры по исследованиям, а не медицинский совет.</p>
    </>
  )
}

function Big({ l, v, h }: { l: string; v: string; h: string }) {
  return <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 18, padding: 14 }}><div className="muted small">{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div className="muted small">{h}</div></div>
}
