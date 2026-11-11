import { useEffect, useMemo, useState } from 'react'
import { canonicalKey } from '../analytics/catalog'
import { DAY_FULL, DAY_SHORT, isoDow, localDay, today as todayDay } from '../analytics/dates'
import { exerciseDays } from '../analytics/insights'
import { WARMUP, WORKING, exerciseRecords, formatKg, parseKgToGrams, tonnageGrams } from '../analytics/metrics'
import { ForecastResult, SetForecast, compare, fHigh, fLow, predict } from '../analytics/forecast'
import { Wheel } from './Wheel'
import { suggestFor } from '../analytics/progression'
import { useAccess } from '../access'
import { GOALS, TrainingGoal, goalReps, goalTitle, parseGoal, restSeconds, setsText, warmup } from '../analytics/goal'
import { CatalogExercise } from '../analytics/catalog'
import { useStore } from '../data/store'
import { WSet, planExercises, planGoals } from '../data/types'
import { Modal, Seg, SheetHeader } from './common'
import { Icon } from './icons'
import { Art, Num, ask } from './motion'
import { haptic } from '../tg'
import { ExercisePicker } from './ExercisePicker'
import { LONG_MS, suggestedEnd } from './Calendar'
import { durationText } from './People'

export function useLastDay() {
  const store = useStore()
  return (exercise: string) => {
    const activeId = store.active?.id
    const past = store.db.sets.filter(s => s.sessionId !== activeId)
    const days = exerciseDays(past.map(s => ({ ...s })), exercise, localDay).filter(d => d.workingSets > 0)
    return days[days.length - 1]
  }
}

export function Workout({ toast }: { toast: (m: string) => void }) {
  const store = useStore()
  return store.active ? <ActiveWorkout toast={toast} /> : <StartPanel />
}

function StartPanel() {
  const store = useStore()
  const lastDay = useLastDay()
  const dow = isoDow(todayDay())
  const todayPlan = store.db.plan.find(p => p.dayOfWeek === dow)
  const [day, setDay] = useState<number | null>(todayPlan?.dayOfWeek ?? null)
  const chosen = store.db.plan.find(p => p.dayOfWeek === day)
  return (
    <>
      <h1>Тренировка</h1>
      <div className="hero">
        <Art name={chosen ? 'dumbbell' : 'kettlebell'} size={140} className="hero-art" />
        <div className="label">{!chosen ? 'Без плана' : chosen.dayOfWeek === dow ? 'Сегодня по плану' : `Из плана: ${DAY_FULL[chosen.dayOfWeek - 1].toLowerCase()}`}</div>
        <h2>{chosen?.title ?? 'Свободная тренировка'}</h2>
        {!chosen && <p className="sub">Выбирай любые упражнения по ходу тренировки.</p>}
        <div style={{ marginTop: 12 }} />
        {chosen && planExercises(chosen).map((n, i) => {
          const ex = store.resolve(n); const d = lastDay(n)
          return (
            <div key={i} className="row" style={{ margin: '9px 0', alignItems: 'flex-start' }}>
              <span className="num-badge">{i + 1}</span>
              <div className="grow"><div>{ex.primary !== 'OTHER' ? ex.name : n}</div>
                <div className="muted small">{d ? `прошлый раз: ${formatKg(d.maxWeightGrams)} кг × ${d.sets.filter(s => (s.kind ?? WORKING) === WORKING).map(s => s.reps).join('/')}` : ''}</div></div>
            </div>
          )
        })}
        <button className="btn block big shine" style={{ marginTop: 14 }} onClick={() => { haptic.ok(); store.startSession(chosen?.title ?? null) }}><Icon.play /> Начать тренировку</button>
      </div>
      {store.db.plan.length > 0 && <>
        <p className="muted" style={{ margin: '16px 2px 8px' }}>Или выбери другой день:</p>
        <div className="chips">
          <button className={'chip' + (day == null ? ' on' : '')} onClick={() => setDay(null)}>Свободная</button>
          {store.db.plan.map(p => <button key={p.dayOfWeek} className={'chip' + (day === p.dayOfWeek ? ' on' : '')} onClick={() => setDay(p.dayOfWeek)}>{DAY_SHORT[p.dayOfWeek - 1]} · {p.title}</button>)}
        </div>
      </>}
    </>
  )
}

type Step = 'exercise' | 'set' | 'effort' | 'rest'
const STEP_ORDER: Step[] = ['exercise', 'set', 'effort', 'rest']
const GOAL_ABOUT: Record<TrainingGoal, string> = {
  hypertrophy: 'Рост мышц. Средний вес, ближе к отказу.',
  strength: 'Поднять больше. Тяжело, мало повторов, долгий отдых.',
  combo: 'Один тяжёлый подход, потом полегче на массу.'
}
/* Where the person is in the flow survives switching tabs, closing Telegram and reloading: it is kept per workout. */
const FLOW_KEY = 'irontrack.flow'
interface SavedFlow {
  sid: string; exercise: string; step: Step; goal: TrainingGoal; weight: string; reps: string; pair: boolean; repsTouched: boolean
  result: { f: SetForecast; actual: number; r: ForecastResult } | null; restEnd: number | null; restSec: number
}
function loadFlow(sid: string): SavedFlow | null {
  try { const v = JSON.parse(localStorage.getItem(FLOW_KEY) || 'null') as SavedFlow | null; return v && v.sid === sid ? v : null } catch { return null }
}
function saveFlow(v: SavedFlow) {
  try { localStorage.setItem(FLOW_KEY, JSON.stringify(v)) } catch { /* storage unavailable */ }
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** The active workout is a simple sequence, like the Android app: exercise → weight & reps → effort → rest → next set. */
function ActiveWorkout({ toast }: { toast: (m: string) => void }) {
  const store = useStore()
  const lastDay = useLastDay()
  const active = store.active!
  const sets = store.db.sets.filter(s => s.sessionId === active.id)
  const activePlan = useMemo(() => store.db.plan.find(x => x.title === active.title), [store.db.plan, active.title])
  const planned = useMemo(() => (activePlan ? planExercises(activePlan) : []), [activePlan])
  const k = canonicalKey
  const [saved] = useState(() => loadFlow(active.id))
  const [exercise, setExercise] = useState(() => saved?.exercise ?? sets[sets.length - 1]?.exercise ?? '')
  const [step, setStepRaw] = useState<Step>(() => saved?.step ?? (exercise ? 'set' : 'exercise'))
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const go = (s: Step) => { setDir(STEP_ORDER.indexOf(s) >= STEP_ORDER.indexOf(step) ? 'fwd' : 'back'); setStepRaw(s); haptic.tap() }

  const defaultGoalFor = (name: string): TrainingGoal => {
    if (activePlan) {
      const i = planned.findIndex(n => k(n) === k(name))
      if (i >= 0) return planGoals(activePlan)[i]
    }
    const last = store.db.sets.filter(x => k(x.exercise) === k(name)).sort((a, b) => b.createdAt - a.createdAt)[0]
    return parseGoal(last?.goal)
  }
  const bestE1rmFor = (name: string) => exerciseRecords(store.logged.filter(x => k(x.exercise ?? '') === k(name)))[0]?.bestE1rmKg ?? null
  const lastSetFor = (name: string) => [...store.db.sets].filter(x => k(x.exercise) === k(name) && x.kind === WORKING).sort((a, b) => b.createdAt - a.createdAt)[0]

  const [goal, setGoal] = useState<TrainingGoal>(() => saved?.goal ?? (exercise ? defaultGoalFor(exercise) : 'hypertrophy'))
  const [weight, setWeight] = useState(saved?.weight ?? '')
  const [reps, setReps] = useState(saved?.reps ?? '')
  const [pair, setPair] = useState(saved?.pair ?? false)
  /** True once the reps wheel was turned; until then reps follow the forecast for the chosen weight. */
  const [repsTouched, setRepsTouched] = useState(saved?.repsTouched ?? false)
  const [result, setResult] = useState<{ f: SetForecast; actual: number; r: ForecastResult } | null>(saved?.result ?? null)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [goalSheet, setGoalSheet] = useState(false)
  const [warmupOpen, setWarmupOpen] = useState(false)
  const [manual, setManual] = useState<'weight' | 'reps' | null>(null)
  const [editing, setEditing] = useState<WSet | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [restEnd, setRestEnd] = useState<number | null>(saved?.restEnd ?? null)
  const [restSec, setRestSec] = useState(saved?.restSec ?? 120)
  useEffect(() => {
    saveFlow({ sid: active.id, exercise, step, goal, weight, reps, pair, repsTouched, result, restEnd, restSec })
  }, [active.id, exercise, step, goal, weight, reps, pair, repsTouched, result, restEnd, restSec])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (restEnd && now >= restEnd) {
      setRestEnd(null)
      navigator.vibrate?.([400, 200, 400])
      haptic.ok()
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Отдых окончен', { body: 'Пора на следующий подход 💪' })
      toast('⏰ Отдых окончен — пора на подход!')
    }
  }, [now, restEnd, toast])

  const ex = exercise ? store.resolve(exercise) : null
  const { access, paywall } = useAccess()
  const here = (name: string) => sets.filter(s => k(s.exercise) === k(name))
  const doneHere = exercise ? here(exercise).filter(s => s.kind !== WARMUP).length : 0
  const forecastAt = (name: string, resolved: CatalogExercise, g: TrainingGoal, grams: number | null) =>
    resolved.primary === 'OTHER' || grams == null ? null : predict(resolved, g, grams, here(name), lastDay(name), bestE1rmFor(name))

  /** Fills the wheels for the next set: same weight as the last set (combo: back-off), else the progression hint. */
  const prefill = (resolved: CatalogExercise, name: string, g: TrainingGoal) => {
    const hint = suggestFor(resolved, lastDay(name), g, bestE1rmFor(name))
    const done = here(name).filter(s => s.kind !== WARMUP)
    const last = done[done.length - 1]
    const grams = g === 'combo' && done.length && hint.backOffWeightGrams != null ? hint.backOffWeightGrams
      : last ? last.weightGrams : hint.targetWeightGrams ?? (resolved.stepGrams >= 2500 ? 20000 : 10000)
    setWeight(formatKg(grams))
    setPair(last ? last.implements === 2 : lastSetFor(name) ? lastSetFor(name)!.implements === 2 : resolved.pair)
    setReps(String(forecastAt(name, resolved, g, grams)?.reps ?? last?.reps ?? hint.targetReps ?? resolved.repsMin))
    setRepsTouched(false)
    setRestSec(restSeconds(resolved, g))
  }

  // Reopened in the middle of an exercise: fill the wheels once.
  useEffect(() => { if (step === 'set' && ex && ex.primary !== 'OTHER' && !weight) prefill(ex, exercise, goal) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (name: string) => {
    const resolved = store.resolve(name)
    setExercise(resolved.primary !== 'OTHER' && !resolved.custom ? resolved.name : name)
    const g = defaultGoalFor(name)
    setGoal(g)
    setError(null); setResult(null); setPicker(false)
    if (resolved.primary === 'OTHER') { go('exercise'); setPicker(true); return }
    prefill(resolved, name, g)
    go('set')
  }

  const onWeight = (w: string) => {
    setWeight(w)
    if (!repsTouched && ex) { const f = forecastAt(exercise, ex, goal, parseKgToGrams(w)); if (f) setReps(String(f.reps)) }
  }

  const record = async (rir: number | null) => {
    if (!ex) return
    const grams = parseKgToGrams(weight); const n = Number(reps)
    if (grams == null || !Number.isInteger(n) || n < 1) { setError('Укажи вес и повторы'); go('set'); return }
    const f = forecastAt(exercise, ex, goal, grams)
    await store.addSet({ exercise: exercise.trim(), weightGrams: grams, reps: n, rir, kind: WORKING, implements: pair ? 2 : 1, goal, targetReps: f?.reps ?? null })
    haptic.ok()
    // Back-off sets of combo are judged against the hypertrophy range.
    const judge: TrainingGoal = goal === 'combo' && doneHere > 0 ? 'hypertrophy' : goal
    setResult(f ? { f, actual: n, r: compare(f, n, rir, ex, judge) } : null)
    if (!f) toast(`Записано: ${weight} кг × ${n} ✓`)
    setRestEnd(Date.now() + restSec * 1000)
    go('rest')
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }

  const groups = new Map<string, WSet[]>()
  for (const s of sets) groups.set(k(s.exercise), [...(groups.get(k(s.exercise)) ?? []), s])
  const working = sets.filter(s => s.kind === WORKING)
  const tonnage = tonnageGrams(sets)
  const elapsed = Math.max(0, Math.floor((now - active.startedAt) / 1000))
  const left = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : null
  const grams = parseKgToGrams(weight)
  const forecast = ex && step === 'set' ? forecastAt(exercise, ex, goal, grams) : null

  // wheel values
  const stepG = Math.max(ex?.stepGrams ?? 2500, 500)
  const top = Math.max(300_000, Math.floor(((grams ?? 0) * 3) / 2 / stepG) * stepG)
  const weights: number[] = []
  for (let g = 0; g <= top; g += stepG) weights.push(g)
  if (grams != null && !weights.includes(grams)) { weights.push(grams); weights.sort((a, b) => a - b) }
  const repN = Math.min(60, Math.max(1, Number(reps) || 1))

  const names = planned.length ? planned : [...new Set([...store.db.sets].sort((a, b) => b.createdAt - a.createdAt).map(s => s.exercise))].slice(0, 6)

  return (
    <>
      <div className="live-head">
        <div className="grow">
          <div className="label"><i className="pulse-dot" />{active.title ?? 'Свободная тренировка'}</div>
          <div className="muted small"><Num text={`${working.length} подх.`} ms={400} /> • <Num text={`${formatKg(tonnage)} кг`} ms={500} /></div>
        </div>
        <div className="timer">{Math.floor(elapsed / 3600)}:{String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</div>
      </div>

      <div key={step + (step === 'set' ? exercise : '')} className={'card flow ' + dir}>
        {step === 'exercise' && <>
          <div className="caption">Шаг 1</div>
          <h2 className="flow-title">Какое упражнение?</h2>
          {names.map((name, i) => {
            const e = store.resolve(name)
            const done = here(name).filter(s => s.kind !== WARMUP).length
            const d = done ? null : lastDay(name)
            return (
              <button key={name} className={'ex-row' + (done ? ' done' : '')} onClick={() => select(name)} style={{ animationDelay: `${i * 40}ms` }}>
                <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="grow"><b>{e.primary !== 'OTHER' ? e.name : name}</b>
                  {done > 0 ? <span className="small ok-text">✓ {done} подх. сделано</span>
                    : d ? <span className="muted small">прошлый раз {formatKg(d.maxWeightGrams)} кг × {d.sets.filter(s => (s.kind ?? WORKING) === WORKING).map(s => s.reps).join('/')}</span> : null}</span>
                <span className="muted"><Icon.chevron /></span>
              </button>
            )
          })}
          <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setPicker(true)}><Icon.plus /> {names.length ? 'Другое упражнение' : 'Выбрать упражнение'}</button>
        </>}

        {step === 'set' && ex && <>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="grow"><div className="caption">Подход {doneHere + 1}</div><h2 className="flow-title">{ex.primary !== 'OTHER' && !ex.custom ? ex.name : exercise}</h2></div>
            <button className="link small" style={{ color: 'var(--muted)' }} onClick={() => go('exercise')}>Сменить</button>
          </div>
          <button className="goal-line" onClick={() => setGoalSheet(true)}><span className="grow">{goalTitle(goal)} • {setsText(ex, goal)}</span><Icon.chevron /></button>
          {goal !== 'hypertrophy' && ex.axial && <div className="small danger" style={{ margin: '4px 0' }}>⚠ Нагрузка на позвоночник — с тяжёлым весом осторожно</div>}
          <div className="target">
            <div className="caption" style={{ color: 'var(--orange)' }}>Цель подхода</div>
            {forecast && !access.premium ? <button className="target-lock" onClick={() => paywall('Прогноз подхода')}><b>🔒 Прогноз повторов</b><span className="muted small">Сколько сделать при этом весе — в Premium</span></button>
              : forecast ? <>
                <div className="target-big"><Num text={`${fLow(forecast)}–${fHigh(forecast)}`} ms={350} /> повторов</div>
                <div className="muted small">оставь {forecast.rir} в запасе • {forecast.basis}</div>
                {forecast.note && <div className="row" style={{ marginTop: 6 }}><span className="small grow" style={{ color: 'var(--orange)' }}>{forecast.note}</span>
                  {forecast.suggestedWeightGrams != null && <button className="chip on" onClick={() => onWeight(formatKg(forecast.suggestedWeightGrams!))}>Взять {formatKg(forecast.suggestedWeightGrams)} кг</button>}</div>}
              </> : <>
                <div className="target-big">{goalReps(ex, goal).first}–{goalReps(ex, goal).last} повторов</div>
                <div className="muted small">Первый раз — подбери вес, с которым это получается</div>
              </>}
          </div>
          <div className="wheels">
            <div><div className="caption center">{pair ? 'кг (одна гантель)' : 'кг'}</div>
              <Wheel count={weights.length} index={Math.max(0, weights.indexOf(grams ?? 0))} label={i => formatKg(weights[i])} onPick={i => onWeight(formatKg(weights[i]))} onCenterClick={() => setManual('weight')} /></div>
            <div><div className="caption center">повторы</div>
              <Wheel count={60} index={repN - 1} label={i => String(i + 1)} onPick={i => { setReps(String(i + 1)); setRepsTouched(true) }} onCenterClick={() => setManual('reps')} /></div>
          </div>
          {error && <p className="danger" style={{ textAlign: 'center' }}>{error}</p>}
          <button className="btn block big" onClick={() => {
            if (parseKgToGrams(weight) == null) return setError('Укажи вес')
            if (!(Number(reps) >= 1)) return setError('Укажи повторы')
            setError(null); go('effort')
          }}>Сделал подход</button>
          {doneHere === 0 && grams != null && warmup(grams, ex, goal).length > 0 &&
            <button className="link block-link" onClick={() => setWarmupOpen(true)}>Сначала разминка</button>}
        </>}

        {step === 'effort' && <>
          <div className="caption">Подход {weight} кг × {reps}</div>
          <h2 className="flow-title">Сколько повторов ещё мог сделать?</h2>
          <div className="muted">Честный ответ делает прогноз точнее</div>
          <div className="effort">
            {([[0, 'отказ'], [1, ''], [2, ''], [3, '']] as [number, string][]).map(([v, sub], i) => (
              <button key={v} onClick={() => record(v)} style={{ animationDelay: `${i * 45}ms` }}><b>{v === 3 ? '3+' : v}</b>{sub && <span>{sub}</span>}</button>
            ))}
          </div>
          <div className="between"><button className="link small" style={{ color: 'var(--muted)' }} onClick={() => go('set')}>‹ Назад</button><button className="link small" style={{ color: 'var(--muted)' }} onClick={() => record(null)}>Не знаю</button></div>
        </>}

        {step === 'rest' && <>
          {result && (() => {
            const color = result.r.verdict === 'ABOVE' ? 'var(--good)' : result.r.verdict === 'BELOW' ? 'var(--bad)' : 'var(--text)'
            return (
              <div className="plan-fact">
                <div className="pf"><div className="caption">План</div><b className="muted">{result.f.reps}</b></div>
                <div className="pf-arrow"><Icon.chevron /></div>
                <div className="pf"><div className="caption">Факт</div><b style={{ color }}><Num text={String(result.actual)} ms={500} /></b></div>
                <div className="pf-text"><b style={{ color }}>{result.r.title}</b><div className="muted small">{result.r.advice}</div></div>
              </div>
            )
          })()}
          <div className="rest-big">
            <div className="ring big">
              <svg width="176" height="176" viewBox="0 0 176 176">
                <defs><linearGradient id="restg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB36B" /><stop offset="1" stopColor="#FF5A1F" /></linearGradient></defs>
                <circle cx="88" cy="88" r="78" style={{ stroke: 'rgb(var(--fg) / .07)' }} strokeWidth="10" fill="none" />
                <circle cx="88" cy="88" r="78" stroke={left === null ? 'var(--good)' : 'url(#restg)'} strokeWidth="10" fill="none" strokeLinecap="round"
                  strokeDasharray={BIG_RING} strokeDashoffset={left == null ? 0 : BIG_RING * (1 - left / restSec)} />
              </svg>
              <div className="ring-in"><div className="caption">Отдых</div><b style={left === null ? { color: 'var(--good)' } : undefined}>{left == null ? 'Пора!' : clock(left)}</b>
                {left != null && <button className="link small" style={{ color: 'var(--muted)' }} onClick={() => setRestEnd(null)}>Пропустить</button>}</div>
            </div>
          </div>
          <button className="btn block big" onClick={() => { if (ex) prefill(ex, exercise, goal); setResult(null); go('set') }}>Следующий подход</button>
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { setResult(null); go('exercise') }}>Другое упражнение</button>
        </>}
      </div>

      {sets.length > 0 && (
        <div className="card">
          <div className="caption" style={{ marginBottom: 6 }}>Сегодня</div>
          {[...groups.values()].map(g => (
            <div key={g[0].id} className="ex-group">
              <div className="between"><b>{store.resolve(g[0].exercise).name}</b><span className="muted small">{formatKg(tonnageGrams(g))} кг</span></div>
              {g.map((s, i) => <SetRow key={s.id} n={i + 1} s={s} onClick={() => setEditing(s)} />)}
            </div>
          ))}
          <p className="muted small" style={{ margin: 0 }}>Нажми на подход, чтобы исправить или удалить</p>
        </div>
      )}
      <button className="quiet-btn" onClick={() => (sets.length ? setConfirmFinish(true) : store.finishSession())}>{sets.length ? 'Завершить тренировку' : 'Отменить тренировку'}</button>

      {picker && <ExercisePicker title={ex?.primary === 'OTHER' ? `Что качает «${exercise}»?` : undefined} initialQuery={ex?.primary === 'OTHER' ? exercise : ''} planned={planned} onPick={select} onClose={() => setPicker(false)} />}
      {editing && <SetEditor set={editing} onClose={() => setEditing(null)} />}
      {goalSheet && ex && (
        <Modal onClose={() => setGoalSheet(false)}>
          <SheetHeader title="Цель упражнения" onClose={() => setGoalSheet(false)} />
          {GOALS.map(g => (
            <button key={g.id} className={'plan-opt goal-opt' + (g.id === goal ? ' on' : '')} onClick={() => { setGoal(g.id); prefill(ex, exercise, g.id); setGoalSheet(false) }}>
              <span className="radio" />
              <span className="grow" style={{ textAlign: 'left' }}><b>{g.title}</b><br /><span className="muted small">{GOAL_ABOUT[g.id]}</span><br /><span className="small" style={{ color: 'var(--orange)' }}>{setsText(ex, g.id)}</span></span>
            </button>
          ))}
        </Modal>
      )}
      {manual && (
        <NumberSheet title={manual === 'weight' ? 'Вес, кг' : 'Повторы'} value={manual === 'weight' ? weight : reps} decimal={manual === 'weight'} onClose={() => setManual(null)}
          onSave={t => {
            if (manual === 'weight') { const g = parseKgToGrams(t); if (g == null) return false; onWeight(formatKg(g)); return true }
            const n = Number(t); if (!Number.isInteger(n) || n < 1 || n > 60) return false; setReps(String(n)); setRepsTouched(true); return true
          }} />
      )}
      {warmupOpen && ex && (() => {
        const ramp = warmup(parseKgToGrams(weight) ?? 0, ex, goal)
        return (
          <Modal onClose={() => setWarmupOpen(false)}>
            <SheetHeader title={`Разминка до ${weight} кг`} onClose={() => setWarmupOpen(false)} />
            {ramp.map((w, i) => <div key={i} className="set-row"><div className="n">{i + 1}</div><div className="grow">{formatKg(w.weightGrams)} кг × {w.reps}</div></div>)}
            <p className="muted small">Отдых между ними 1–2 мин. В статистику не идёт.</p>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setWarmupOpen(false)}>Закрыть</button>
              <button className="btn" onClick={async () => {
                for (const w of ramp) await store.addSet({ exercise: exercise.trim(), weightGrams: w.weightGrams, reps: w.reps, rir: null, kind: WARMUP, implements: pair ? 2 : 1, goal })
                setWarmupOpen(false); toast('Разминка записана ✓')
              }}>Сделал</button>
            </div>
          </Modal>
        )
      })()}
      {confirmFinish && (
        <Modal onClose={() => setConfirmFinish(false)}>
          <div className="empty" style={{ padding: '0 0 6px' }}><Art name="trophy" size={110} /></div>
          <h2 style={{ textAlign: 'center', fontSize: 20 }}>Завершить тренировку?</h2>
          <p className="muted" style={{ textAlign: 'center' }}>{working.length} рабочих подходов, тоннаж {formatKg(tonnage)} кг. Отличная работа!</p>
          {(() => {
            const end = suggestedEnd(sets, active.startedAt)
            return Date.now() - active.startedAt > LONG_MS && end ? <>
              <div className="warn"><b>Тренировка идёт уже {durationText(active.startedAt, Date.now())}</b><div className="muted small">Наверное, её забыли завершить. Последний подход был в {new Date(end - 5 * 60_000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}.</div></div>
              <button className="btn block" onClick={() => { store.finishSession(end); setConfirmFinish(false) }}>Завершить по последнему подходу</button>
              <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { store.finishSession(); setConfirmFinish(false) }}>Завершить сейчас</button>
            </> : <div className="dialog-actions"><button className="btn ghost" onClick={() => setConfirmFinish(false)}>Продолжить</button><button className="btn" onClick={() => { haptic.ok(); store.finishSession(); setConfirmFinish(false) }}>Завершить</button></div>
          })()}
        </Modal>
      )}
    </>
  )
}

const BIG_RING = 2 * Math.PI * 78

function NumberSheet({ title, value, decimal, onSave, onClose }: { title: string; value: string; decimal: boolean; onSave: (t: string) => boolean; onClose: () => void }) {
  const [t, setT] = useState(value)
  const [bad, setBad] = useState(false)
  return (
    <Modal onClose={onClose} className="dialog">
      <SheetHeader title={title} onClose={onClose} />
      <input autoFocus className="big-input" inputMode={decimal ? 'decimal' : 'numeric'} value={t} onChange={e => { setT(e.target.value); setBad(false) }}
        onKeyDown={e => { if (e.key === 'Enter' && onSave(t)) onClose() }} />
      {bad && <p className="danger small">{decimal ? 'Число от 0 до 1000' : 'Целое число от 1 до 60'}</p>}
      <div className="dialog-actions">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn" onClick={() => { if (onSave(t)) onClose(); else setBad(true) }}>Готово</button>
      </div>
    </Modal>
  )
}

export function SetRow({ n, s, onClick }: { n?: number; s: WSet; onClick?: () => void }) {
  return (
    <div className="set-row" onClick={onClick}>
      {n != null && <div className="n">{n}</div>}
      <div className="grow" style={{ color: s.kind === WARMUP ? 'var(--muted)' : 'var(--text)' }}>{formatKg(s.weightGrams)} кг{s.implements > 1 ? ' ×2' : ''} × {s.reps}</div>
      {s.kind !== WARMUP && (s.goal === 'strength' || (s.goal === 'combo' && s.reps <= 6)) && <span className="pill">🏋️ сила</span>}
      {s.rir != null && <span className="pill">RIR {s.rir}</span>}
      {s.kind === WARMUP && <span className="pill muted">разминка</span>}
    </div>
  )
}

export function SetEditor({ set, onClose }: { set: WSet; onClose: () => void }) {
  const store = useStore()
  const [weight, setWeight] = useState(formatKg(set.weightGrams))
  const [reps, setReps] = useState(String(set.reps))
  const [rir, setRir] = useState(set.rir == null ? '' : String(set.rir))
  const [kind, setKind] = useState(set.kind)
  const [pair, setPair] = useState(set.implements === 2)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const g = parseKgToGrams(weight); const n = Number(reps); const r = rir === '' ? null : Number(rir)
    if (g == null) return setError('Вес: число от 0 до 1000 кг')
    if (!Number.isInteger(n) || n < 1 || n > 1000) return setError('Повторы: от 1 до 1000')
    if (r != null && (!Number.isInteger(r) || r < 0 || r > 10)) return setError('RIR: от 0 до 10 или пусто')
    await store.updateSet({ ...set, weightGrams: g, reps: n, rir: r, kind, implements: pair ? 2 : 1 })
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <SheetHeader title="Изменить подход" onClose={onClose} />
      <b style={{ color: 'var(--orange)' }}>{set.exercise}</b>
      <div className="grid2" style={{ gridTemplateColumns: '1.3fr 1fr 0.8fr', marginTop: 8 }}>
        <div><label>Вес, кг</label><input value={weight} onChange={e => setWeight(e.target.value)} inputMode="decimal" /></div>
        <div><label>Повторы</label><input value={reps} onChange={e => setReps(e.target.value)} inputMode="numeric" /></div>
        <div><label>RIR</label><input value={rir} onChange={e => setRir(e.target.value)} inputMode="numeric" /></div>
      </div>
      <Seg options={[[WORKING, 'Рабочий'], [WARMUP, 'Разминка']]} value={kind} onChange={setKind} />
      <label className="tick"><input type="checkbox" checked={pair} onChange={e => setPair(e.target.checked)} /> Пара гантелей ×2</label>
      {error && <p className="danger">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={save}>Сохранить</button>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <div className="grow" />
        <button className="danger" onClick={async () => { if (await ask('Удалить подход?', { ok: 'Удалить', danger: true })) { await store.deleteSet(set.id); onClose() } }}>Удалить</button>
      </div>
    </Modal>
  )
}

