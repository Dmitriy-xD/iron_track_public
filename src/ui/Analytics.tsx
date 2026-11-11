import { useState } from 'react'
import { muscleTitle } from '../analytics/catalog'
import { formatDM, formatDay, formatShort, isoDow, localDay, plural, today as todayDay, weekStart } from '../analytics/dates'
import { adherence, e1rmHistory, exerciseDays, exerciseStats, muscleVolume, weekly } from '../analytics/insights'
import { completedWorkingSets, exerciseRecords, fmt1, formatKg, tonnageGrams } from '../analytics/metrics'
import { suggest } from '../analytics/progression'
import { useStore } from '../data/store'
import { BarChart, Kpi, LineChart, MuscleBar, MuscleLine, Seg } from './common'
import { useLastDay } from './Workout'
import { Icon } from './icons'
import { Art } from './motion'

type Tab = 'overview' | 'exercises' | 'muscles' | 'body'
const PERIODS: [number, string][] = [[1, 'Неделя'], [4, '4 нед'], [12, '12 нед'], [26, '½ года'], [52, 'Год']]
const fmtSets = (v: number) => (v % 1 === 0 ? String(v) : fmt1(v))

export function Analytics({ openExercise, openStory }: { openExercise: (n: string) => void; openStory: () => void }) {
  const store = useStore()
  const { db } = store
  const [tab, setTab] = useState<Tab>('overview')
  const [weeks, setWeeks] = useState(4)
  const t = todayDay()
  const from = weekStart(t) - 7 * (weeks - 1)
  return (
    <>
      <h1>Аналитика</h1>
      <button className="story-btn" onClick={openStory}><Art name="chart" size={58} /><span style={{ flex: 1 }}><b>Итоги недели</b><br /><span className="muted small">Что получилось, что подтянуть и план — за минуту</span></span><span className="go"><Icon.chevron /></span></button>
      <Seg options={[['overview', 'Обзор'], ['exercises', 'Упражн.'], ['muscles', 'Мышцы'], ['body', 'Тело']]} value={tab} onChange={setTab} />
      {tab !== 'body' && <><Seg options={PERIODS} value={weeks} onChange={setWeeks} /><p className="muted small">С {formatDay(from)} по сегодня</p></>}
      {!db.sets.length && tab !== 'body' ? <div className="card empty"><Art name="chart" size={110} /><h2>Пока нет данных</h2><p className="muted">Запиши первую тренировку — здесь появятся графики.</p></div>
        : tab === 'overview' ? <Overview from={from} weeks={weeks} openExercise={openExercise} />
          : tab === 'exercises' ? <Exercises from={from} openExercise={openExercise} />
            : tab === 'muscles' ? <Muscles from={from} weeks={weeks} /> : <Body />}
    </>
  )
}

function Overview({ from, weeks, openExercise }: { from: number; weeks: number; openExercise: (n: string) => void }) {
  const store = useStore()
  const { db, logged } = store
  const t = todayDay()
  const periodSets = logged.filter(s => localDay(s.createdAt!) >= from)
  const sessions = db.sessions.filter(s => localDay(s.startedAt) >= from).length
  const adh = adherence(new Set(db.plan.map(p => p.dayOfWeek)), new Set(db.sessions.map(s => localDay(s.startedAt))), from, t, t, isoDow)
  const w = weekly(logged, db.sessions.map(s => s.startedAt), Math.max(weeks, 8), t, localDay)
  const top = exerciseStats(logged, store.resolve, from, t, localDay).slice(0, 3)
  const records = exerciseRecords(logged).sort((a, b) => b.bestE1rmKg - a.bestE1rmKg).slice(0, 6)
  return (
    <>
      <div className="grid2">
        <Kpi label="Тренировок" value={String(sessions)} hint="за период" />
        <Kpi label="План выполнен" value={adh.planned ? `${adh.percent}%` : '—'} hint={`${adh.done} из ${adh.planned} дней`} accent={adh.planned > 0 && adh.percent >= 80} />
        <Kpi label="Тоннаж" value={`${formatKg(Math.trunc(tonnageGrams(periodSets) / 1000) * 1000)} кг`} hint="рабочие подходы" />
        <Kpi label="Подходов" value={String(completedWorkingSets(periodSets))} hint="рабочих" />
      </div>
      <div className="card"><h2>Тоннаж по неделям</h2><BarChart values={w.map(x => x.tonnageGrams / 1000)} labels={w.map(x => formatDM(x.weekStart))} format={v => `${Math.trunc(v)} кг`} /><p className="muted small">Сумма «вес × повторы» рабочих подходов. Больше тоннаж ≠ обязательно больше роста мышц.</p></div>
      <div className="card"><h2>Рабочие подходы по неделям</h2><BarChart values={w.map(x => x.workingSets)} labels={w.map(x => formatDM(x.weekStart))} format={v => String(v)} height={110} /></div>
      {top.length > 0 && <div className="card"><h2>Топ упражнений по тоннажу</h2>{top.map(s => <StatRow key={s.name} s={s} max={top[0].tonnageGrams} onClick={() => openExercise(s.name)} />)}</div>}
      {records.length > 0 && <div className="card"><div className="row" style={{ marginBottom: 6 }}><Art name="trophy" size={42} /><h2 style={{ margin: 0 }}>Рекорды (расчётный 1ПМ)</h2></div>{records.map(r => (
        <div key={r.exercise} className="rec-row" onClick={() => openExercise(r.exercise)}>
          <div className="grow"><div>{r.exercise}</div><div className="muted small">{formatKg(r.weightGrams)} кг × {r.reps}</div></div><span className="val">≈{fmt1(r.bestE1rmKg)} кг</span>
        </div>))}<p className="muted small">1ПМ — оценка по формуле Эпли, а не фактический максимум.</p></div>}
    </>
  )
}

function StatRow({ s, max, onClick }: { s: ReturnType<typeof exerciseStats>[number]; max: number; onClick: () => void }) {
  return (
    <div style={{ padding: '6px 0', cursor: 'pointer' }} onClick={onClick}>
      <div className="between">
        <div><b>{s.name}</b><div className="muted small">{muscleTitle(s.primary)} • последний раз {formatShort(s.lastDate)}</div></div>
        <div style={{ textAlign: 'right' }}><span className="stat-val">{formatKg(s.tonnageGrams)} кг</span>
          {s.lastChangePct != null && <div className="small" style={{ color: s.lastChangePct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{s.lastChangePct >= 0 ? `▲ +${s.lastChangePct}%` : `▼ ${s.lastChangePct}%`}</div>}</div>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (s.tonnageGrams / (max || 1)) * 100)}%` }} /></div>
    </div>
  )
}

function Exercises({ from, openExercise }: { from: number; openExercise: (n: string) => void }) {
  const store = useStore()
  const stats = exerciseStats(store.logged, store.resolve, from, todayDay(), localDay)
  return (
    <>
      <p className="muted small">Тоннаж, подходы и лучший результат по каждому упражнению. Нажми — откроется подробная статистика.</p>
      {!stats.length && <div className="card muted">За этот период рабочих подходов нет</div>}
      {stats.map(s => (
        <div key={s.name} className="card" style={{ cursor: 'pointer' }} onClick={() => openExercise(s.name)}>
          <StatRow s={s} max={stats[0].tonnageGrams} onClick={() => openExercise(s.name)} />
          <div className="muted small">{[`${s.workingSets} подх.`, `${s.days} ${plural(s.days, 'тренировка', 'тренировки', 'тренировок')}`, `макс ${formatKg(s.maxWeightGrams)} кг`, s.bestE1rmKg != null ? `1ПМ ≈${fmt1(s.bestE1rmKg)} кг` : null].filter(Boolean).join(' • ')}</div>
        </div>
      ))}
    </>
  )
}

function Muscles({ from, weeks }: { from: number; weeks: number }) {
  const store = useStore()
  const volume = muscleVolume(store.logged, store.resolve, from, todayDay(), localDay)
  const [open, setOpen] = useState<string | null>(null)
  const other = volume.find(v => v.muscle === 'OTHER')
  return (
    <>
      <div className="card">
        <b>Как считаются подходы</b>
        <div className="small"><span style={{ color: 'var(--orange)' }}>■</span> прямые — мышца целевая (жим ногами → квадрицепс)</div>
        <div className="small"><span style={{ color: 'rgba(255,138,43,.5)' }}>■</span> косвенные ×½ — мышца помогает (тяга блока → бицепс)</div>
        <p className="muted small">Зелёная полоса — ориентир 10–20 подходов в неделю. Нажми на мышцу, чтобы увидеть упражнения.</p>
      </div>
      {other && <div className="warn"><b>⚠ {other.direct} подходов без указанных мышц</b><div className="muted small">Упражнения: {other.contributions.map(c => c.exercise).join(', ')}. Уточни их в плане.</div></div>}
      {!volume.length && <div className="card muted">За этот период рабочих подходов нет</div>}
      {volume.filter(v => v.muscle !== 'OTHER').map(v => {
        const per = v.effective / weeks, max = Math.max(per, 20) * 1.1
        return (
          <div key={v.muscle} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === v.muscle ? null : v.muscle)}>
            <div className="between"><b>{muscleTitle(v.muscle)}</b><b style={{ color: 'var(--orange)' }}>{fmtSets(per)}{weeks > 1 ? ' / нед' : ''} {open === v.muscle ? '▲' : '▼'}</b></div>
            <div style={{ margin: '8px 0' }}><MuscleBar direct={v.direct / weeks} indirectHalf={(v.indirect * 0.5) / weeks} max={max} /></div>
            <div className="muted small">{v.direct} прямых + {v.indirect} косвенных (×½) = {fmtSets(v.effective)} за период{per < 10 ? ' • меньше ориентира' : per > 20 ? ' • выше ориентира' : ' • в зоне ✓'}</div>
            {open === v.muscle && v.contributions.map(c => <div key={c.exercise} className="between small" style={{ marginTop: 4 }}><span>{c.exercise}</span><span className="muted">{[c.direct ? `${c.direct} прям.` : '', c.indirect ? `${c.indirect} косв.` : ''].filter(Boolean).join(' + ')}</span></div>)}
          </div>
        )
      })}
    </>
  )
}

function Body() {
  const { db } = useStore()
  const m = db.measurements
  if (!m.length) return <div className="card empty"><Art name="kettlebell" size={100} /><h2>Нет замеров</h2><p className="muted">Добавь вес и обхваты в профиле — тут появятся графики.</p></div>
  const series: [string, (x: typeof m[number]) => number | null, string][] = [
    ['Вес тела', x => (x.weightGrams == null ? null : x.weightGrams / 1000), 'var(--good)'], ['Талия, см', x => x.waistCm, 'var(--orange)'],
    ['Грудь, см', x => x.chestCm, 'var(--orange)'], ['Бицепс, см', x => x.armCm, 'var(--orange)'], ['Жир, %', x => x.bodyFatPct, 'var(--orange)']
  ]
  return <>{series.map(([title, get, color]) => {
    const pts = m.filter(x => get(x) != null)
    if (!pts.length) return null
    return <div key={title} className="card"><h2>{title}</h2><LineChart values={pts.map(x => get(x)!)} labels={pts.map(x => formatShort(x.epochDay))} start={formatShort(pts[0].epochDay)} end={formatShort(pts[pts.length - 1].epochDay)} format={v => fmt1(v)} color={color} /></div>
  })}</>
}

export function ExerciseDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const store = useStore()
  const lastDay = useLastDay()
  const ex = store.resolve(name)
  const days = exerciseDays(store.logged, name, localDay)
  const working = days.filter(d => d.workingSets > 0)
  const [chart, setChart] = useState(0)
  const recent = working.slice(-12)
  const e1 = e1rmHistory(store.logged, name, localDay).slice(-12)
  const hint = suggest(ex, lastDay(name))
  return (
    <>
      <div className="row" style={{ margin: '4px 0 8px', alignItems: 'flex-start' }}><button className="icon-btn" onClick={onBack} aria-label="Назад"><Icon.back /></button><h1 style={{ margin: '4px 0 0', fontSize: 22 }}>{ex.name}</h1></div>
      <MuscleLine ex={ex} />
      {ex.primary !== 'OTHER' && <p className="muted small">Рабочий диапазон: {ex.repsMin}–{ex.repsMax} повторов • шаг веса {formatKg(ex.stepGrams)} кг</p>}
      {!working.length ? <div className="card muted">По этому упражнению ещё нет рабочих подходов.</div> : <>
        <div className="card tip"><Art name="stopwatch" size={46} /><div><b style={{ color: 'var(--orange)' }}>В следующий раз</b><div style={{ fontWeight: 700, marginTop: 4 }}>{hint.title}</div><p className="muted" style={{ margin: '4px 0 0' }}>{hint.details}</p></div></div>
        <div className="grid2">
          <Kpi label="Тоннаж всего" value={`${formatKg(Math.trunc(working.reduce((a, d) => a + d.tonnageGrams, 0) / 1000) * 1000)} кг`} />
          <Kpi label="Тренировок" value={String(working.length)} />
          <Kpi label="Макс. вес" value={`${formatKg(Math.max(...working.map(d => d.maxWeightGrams)))} кг`} />
          <Kpi label="Лучший 1ПМ" value={e1.length ? `≈${fmt1(Math.max(...e1.map(p => p.e1rmKg)))}` : '—'} hint="расчётный" accent={e1.length > 0} art={e1.length ? 'trophy' : undefined} />
        </div>
        <div className="card">
          <Seg options={[[0, 'Тоннаж'], [1, '1ПМ'], [2, 'Макс. вес']]} value={chart} onChange={setChart} />
          {chart === 0 ? <BarChart values={recent.map(d => d.tonnageGrams / 1000)} labels={recent.map(d => formatDM(d.date))} format={v => `${Math.trunc(v)} кг`} />
            : chart === 1 ? (e1.length ? <LineChart values={e1.map(p => p.e1rmKg)} labels={e1.map(p => formatShort(p.date))} start={formatShort(e1[0].date)} end={formatShort(e1[e1.length - 1].date)} format={v => `${fmt1(v)} кг`} /> : <p className="muted">Нужны подходы на 1–12 повторов</p>)
              : <LineChart values={recent.map(d => d.maxWeightGrams / 1000)} labels={recent.map(d => formatShort(d.date))} start={formatShort(recent[0].date)} end={formatShort(recent[recent.length - 1].date)} format={v => `${fmt1(v)} кг`} color="var(--good)" />}
        </div>
        <div className="section-title"><h2>История</h2></div>
        {[...days].reverse().map(d => (
          <div key={d.date} className="card">
            <div className="between"><b>{formatDay(d.date)}</b><b style={{ color: 'var(--orange)' }}>{formatKg(d.tonnageGrams)} кг</b></div>
            <div>{d.sets.map(s => `${s.kind === 'warmup' ? '(р) ' : ''}${formatKg(s.weightGrams)}${(s.implements ?? 1) > 1 ? '×2' : ''}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join('   ')}</div>
            {d.bestE1rmKg != null && <div className="muted small">1ПМ ≈{fmt1(d.bestE1rmKg)} кг • {d.workingSets} рабочих подходов</div>}
          </div>
        ))}
        <p className="muted small">(р) — разминка, @2 — запас повторов (RIR).</p>
      </>}
    </>
  )
}
