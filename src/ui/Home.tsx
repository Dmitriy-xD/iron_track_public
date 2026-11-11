import { CATALOG, canonicalKey } from '../analytics/catalog'
import { PlanBanner } from '../access'
import { DAY_FULL, DAY_SHORT, formatDateTime, formatDay, isoDow, localDay, startOfDayMillis, today as todayDay, weekStart } from '../analytics/dates'
import { weekStreak } from '../analytics/insights'
import { WORKING, completedWorkingSets, exerciseRecords, fmt1, formatKg, tonnageGrams } from '../analytics/metrics'
import { useStore } from '../data/store'
import { LONG_MS, LongSessionWarning } from './Calendar'
import { LegalLinks, SupportCard } from './Support'
import { planExercises } from '../data/types'
import { Kpi } from './common'
import { Icon } from './icons'
import { Art } from './motion'
import { tg } from '../tg'

const TIPS = [
  'Добавляй вес, когда все рабочие подходы дошли до верхней границы диапазона повторов — приложение подскажет.',
  'RIR 1–3 (1–3 повтора в запасе) — хороший режим для роста мышц без лишней усталости.',
  '10–20 рабочих подходов на мышцу в неделю — частый ориентир для гипертрофии. Смотри вкладку «Мышцы».',
  'Разминочные подходы не идут в тоннаж и статистику — отмечай их переключателем «Разминка».',
  'Взвешивайся в одно и то же время, утром натощак — так тренд веса будет честнее.',
  'Сон 7–9 часов и достаточно белка (≈1.6–2.2 г на кг веса) важнее любой программы.',
  'При боли в спине или суставах — снизь нагрузку и проконсультируйся с врачом. Техника важнее веса.'
]

export function Home({ go, openExercise, openStory, toast }: { go: (tab: string) => void; openExercise: (n: string) => void; openStory: () => void; toast: (m: string) => void }) {
  const store = useStore()
  const { db, logged } = store
  const t = todayDay()
  const ws = weekStart(t)
  const weekSets = logged.filter(s => localDay(s.createdAt!) >= ws)
  const weekSessions = db.sessions.filter(s => localDay(s.startedAt) >= ws).length
  const streak = weekStreak(db.sessions.map(s => s.startedAt), t, localDay)
  const cutoff = startOfDayMillis(t - 6)
  const before = new Map(exerciseRecords(logged.filter(s => s.createdAt! < cutoff)).map(r => [r.exercise.toLowerCase(), r]))
  const fresh = exerciseRecords(logged).filter(r => {
    const prev = before.get(r.exercise.toLowerCase())
    return logged.some(s => s.createdAt! >= cutoff && canonicalKey(s.exercise!) === canonicalKey(r.exercise)) && (!prev || r.bestE1rmKg > prev.bestE1rmKg + 0.05)
  })
  const todayPlan = db.plan.find(p => p.dayOfWeek === isoDow(t))
  const next = [1, 2, 3, 4, 5, 6, 7].map(i => t + i).map(d => ({ d, p: db.plan.find(p => p.dayOfWeek === isoDow(d)) })).find(x => x.p)
  const h = new Date().getHours()
  const greeting = h >= 5 && h <= 11 ? 'Доброе утро' : h <= 17 && h >= 12 ? 'Добрый день' : 'Добрый вечер'
  const unknown = [...new Set(db.plan.flatMap(planExercises).filter(n => store.resolve(n).primary === 'OTHER'))]
  const workoutDays = new Set(db.sessions.map(s => localDay(s.startedAt)))
  const last = db.sessions.find(s => s.finishedAt != null)
  const lastSets = last ? db.sets.filter(s => s.sessionId === last.id) : []
  const active = store.active
  const activeSets = active ? db.sets.filter(s => s.sessionId === active.id) : []

  const photo: string | undefined = tg?.initDataUnsafe?.user?.photo_url
  const longOnes = db.sessions.filter(s => s.finishedAt != null && s.finishedAt - s.startedAt > LONG_MS && s.startedAt > Date.now() - 60 * 86_400_000)
  return (
    <>
      {longOnes.length > 0 && <LongSessionWarning sessionId={longOnes[0].id} />}
      <div className="top-bar">
        <div>
          <div className="hello">{greeting}{db.profile.name ? `, ${db.profile.name}` : ''} 👋</div>
          <div className="logo">IRONTRACK</div>
          <div className="muted small">{formatDay(t)}, {DAY_FULL[isoDow(t) - 1].toLowerCase()}</div>
        </div>
        <button className="avatar" onClick={() => go('profile')} aria-label="Профиль">
          {photo ? <img src={photo} alt="" /> : db.profile.name ? db.profile.name[0].toUpperCase() : '🙂'}
        </button>
      </div>
      <PlanBanner />
      {unknown.length > 0 && <div className="warn" onClick={() => go('calendar')} style={{ cursor: 'pointer' }}><b>⚠ Уточни упражнения в плане</b><div className="muted small">Не указано, что качают: {unknown.join(', ')}.</div><div className="link small">Открыть план →</div></div>}
      {!db.profile.name && <div className="card"><b>Заполни профиль</b><p className="muted">Имя, рост и цели нужны для отчётов.</p><button className="link" onClick={() => go('profile')}>Открыть профиль</button></div>}
      <div className="hero">
        <Art name={active ? 'flame' : todayPlan ? 'dumbbell' : 'kettlebell'} size={148} className="hero-art" />
        <div className="label">{active ? '● Тренировка идёт' : todayPlan ? 'Сегодня по плану' : 'Сегодня отдых'}</div>
        <h2>{active?.title ?? todayPlan?.title ?? 'Восстановление'}</h2>
        {active ? <div className="sub">{completedWorkingSets(activeSets)} рабочих подходов • {formatKg(tonnageGrams(activeSets))} кг</div>
          : todayPlan ? <div className="sub">{planExercises(todayPlan).join(' · ')}</div>
            : next?.p ? <div className="sub">Следующая: {DAY_FULL[isoDow(next.d) - 1].toLowerCase()} — {next.p.title}</div> : null}
        <button className="btn block big shine" style={{ marginTop: 16 }} onClick={() => go('workout')}><Icon.play /> {active ? 'Продолжить тренировку' : 'Начать тренировку'}</button>
      </div>
      {db.sets.length > 0 && <button className="story-btn" onClick={openStory}><Art name="chart" size={58} /><span style={{ flex: 1 }}><b>Итоги недели</b><br /><span className="muted small">Что получилось, что подтянуть и план на следующую</span></span><span className="go"><Icon.chevron /></span></button>}
      <div className="section-title"><h2>Эта неделя</h2><button className="link small" onClick={() => go('calendar')}>Календарь</button></div>
      <div className="week">
        {[0, 1, 2, 3, 4, 5, 6].map(i => {
          const d = ws + i, done = workoutDays.has(d), planned = db.plan.some(p => p.dayOfWeek === i + 1), missed = planned && !done && d < t
          return <div key={i} className={done ? 'done' : d === t ? 'today' : ''} style={done ? { animationDelay: `${i * 50}ms` } : undefined}>{DAY_SHORT[i]}<b>{new Date(d * 86400000).getUTCDate()}</b><div className="dot" style={{ background: done ? 'rgba(26,10,0,.55)' : missed ? 'var(--bad)' : planned ? 'var(--orange)' : 'transparent' }} /></div>
        })}
      </div>
      <div className="grid2">
        <Kpi label="Тренировки" value={`${weekSessions}/${db.plan.length}`} hint="по плану" />
        <Kpi label="Подходы" value={String(completedWorkingSets(weekSets))} hint="рабочих" />
        <Kpi label="Тоннаж" value={`${formatKg(tonnageGrams(weekSets))} кг`} hint="за неделю" />
        <Kpi label="Серия" value={`${streak} нед`} hint="без пропусков" accent={streak >= 2} art={streak >= 2 ? 'flame' : undefined} />
      </div>
      {fresh.length > 0 && <div className="card"><div className="row" style={{ marginBottom: 6 }}><Art name="trophy" size={40} /><h2 style={{ margin: 0 }}>Новые рекорды за 7 дней</h2></div>{fresh.map(r => <div key={r.exercise} className="rec-row" onClick={() => openExercise(r.exercise)}><span className="grow">{r.exercise}</span><span className="val">≈{fmt1(r.bestE1rmKg)} кг</span></div>)}</div>}
      {last && (
        <div className="card">
          <div className="between"><h2 style={{ margin: 0 }}>Последняя тренировка</h2><span className="pill">{formatKg(tonnageGrams(lastSets))} кг</span></div>
          <div style={{ marginTop: 8 }}><b>{last.title ?? 'Свободная тренировка'}</b></div>
          <div className="muted small">{formatDateTime(last.startedAt)} • {completedWorkingSets(lastSets)} рабочих подходов</div>
          <div style={{ marginTop: 8 }}>
          {[...new Map(lastSets.map(s => [canonicalKey(s.exercise), lastSets.filter(x => canonicalKey(x.exercise) === canonicalKey(s.exercise))])).values()].map(g => (
            <div key={g[0].id} className="rec-row" onClick={() => openExercise(store.resolve(g[0].exercise).name)}>
              <span className="grow">{store.resolve(g[0].exercise).name}</span>
              <span className="muted small">{g.filter(s => s.kind === WORKING).map(s => s.reps).join('/')} × {formatKg(Math.max(...g.map(s => s.weightGrams)))} кг</span>
            </div>
          ))}
          </div>
        </div>
      )}
      <div className="card tip"><Art name="muscle" size={44} /><div><b style={{ color: 'var(--orange)' }}>Совет дня</b><p>{TIPS[t % TIPS.length]}</p></div></div>
      <p className="muted small">В справочнике {CATALOG.length} упражнений.</p>
      {!store.acting && <><SupportCard signedIn toast={toast} /><LegalLinks /></>}
    </>
  )
}
