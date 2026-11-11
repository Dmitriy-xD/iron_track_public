/* First visit: a few questions, then a ready weekly plan, so nobody has to set everything up from scratch. */
import { useState } from 'react'
import { track } from '../access'
import { DAY_SHORT } from '../analytics/dates'
import { AIMS, Aim, Answers, Level, SPLITS, Sex, Split, buildStarterPlan, recommend } from '../analytics/starterPlan'
import { useStore } from '../data/store'
import { haptic } from '../tg'
import { Icon } from './icons'
import { Art } from './motion'

type Step = 'hello' | 'sex' | 'aim' | 'days' | 'split' | 'level' | 'minutes' | 'result'
const KEY = 'irontrack.onboarded.'
export const onboarded = (userId: string) => { try { return !!localStorage.getItem(KEY + userId) } catch { return true } }
const markOnboarded = (userId: string) => { try { localStorage.setItem(KEY + userId, '1') } catch { /* storage unavailable */ } }

export function Onboarding({ onDone }: { onDone: () => void }) {
  const store = useStore()
  const [a, setA] = useState<Answers>({ sex: 'm', aim: 'mass', days: 3, split: 'auto', level: 1, minutes: 60 })
  const [trail, setTrail] = useState<Step[]>(['hello'])
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [saving, setSaving] = useState(false)
  const step = trail[trail.length - 1]
  const steps: Step[] = ['hello', 'sex', 'aim', 'days', 'split', ...(a.split === 'auto' ? ['level' as Step] : []), 'minutes', 'result']
  const idx = steps.indexOf(step)
  const next = (patch: Partial<Answers> = {}) => {
    const na = { ...a, ...patch }
    setA(na)
    const list: Step[] = ['hello', 'sex', 'aim', 'days', 'split', ...(na.split === 'auto' ? ['level' as Step] : []), 'minutes', 'result']
    setDir('fwd'); haptic.tap()
    setTrail(t => [...t, list[list.indexOf(step) + 1]])
  }
  const back = () => { if (trail.length > 1) { setDir('back'); setTrail(t => t.slice(0, -1)) } }
  const skip = () => { markOnboarded(store.userId); track('onboarding_skip', { step }); onDone() }
  const plan = buildStarterPlan(a)
  const finish = async () => {
    if (saving) return
    setSaving(true)
    try {
      for (const d of plan) await store.savePlanDay({ dayOfWeek: d.dayOfWeek, title: d.title, exercises: d.exercises.join('\n'), goals: d.goals.join('\n') })
      const p = store.db.profile
      await store.saveProfile({ ...p, name: p.name || store.user.name || '', sex: a.sex, goal: AIMS.find(x => x.id === a.aim)!.profile, experienceYears: p.experienceYears ?? a.level })
      markOnboarded(store.userId)
      track('onboarding_done', { ...a, split: a.split === 'auto' ? `auto:${recommend(a.days, a.level, a.sex)}` : a.split })
      haptic.ok()
      onDone()
    } finally { setSaving(false) }
  }

  const Opt = ({ title, hint, art, on, badge, onClick }: { title: string; hint?: string; art?: string; on?: boolean; badge?: string; onClick: () => void }) => (
    <button className={'opt' + (on ? ' on' : '')} onClick={onClick}>
      {art && <Art name={art} size={52} />}
      <span className="grow"><b>{title}</b>{hint && <span className="muted small">{hint}</span>}</span>
      {badge ? <span className="pill good">{badge}</span> : <span className="muted"><Icon.chevron /></span>}
    </button>
  )
  const rec = recommend(a.days, 1, a.sex)

  return (
    <div className="onb">
      <div className="onb-top">
        {idx > 0 && step !== 'result' ? <button className="icon-btn" onClick={back} aria-label="Назад"><Icon.back /></button> : <span style={{ width: 38 }} />}
        <div className="onb-bars">{steps.slice(1).map((s, i) => <i key={s} className={i < idx ? 'on' : ''} />)}</div>
        {step !== 'result' ? <button className="link small" style={{ color: 'var(--muted)' }} onClick={skip}>Пропустить</button> : <span style={{ width: 38 }} />}
      </div>
      <div key={step} className={'onb-body ' + dir}>
        {step === 'hello' && <>
          <Art name="dumbbell" size={190} className="onb-hero" />
          <h1>Привет{store.user.name ? `, ${store.user.name}` : ''}! Я IRONTRACK</h1>
          <p className="muted">Твой дневник зала. Пара вопросов — и я соберу тебе программу тренировок. Её можно будет поменять когда угодно.</p>
          <div className="onb-feats">
            <div><Art name="stopwatch" size={40} /><span>Подход записывается за 2 секунды</span></div>
            <div><Art name="chart" size={40} /><span>Подскажу вес и повторы на каждый подход</span></div>
            <div><Art name="trophy" size={40} /><span>Рекорды, прогресс и итоги недели</span></div>
          </div>
          <button className="btn block big shine" onClick={() => next()}>Поехали</button>
        </>}
        {step === 'sex' && <>
          <div className="caption">Вопрос 1</div><h1>Ты занимаешься как…</h1>
          <p className="muted">От этого зависят упражнения в программе.</p>
          {([['m', 'Мужчина', 'Акцент на грудь, спину и руки'], ['f', 'Девушка', 'Акцент на ноги и ягодицы']] as [Sex, string, string][]).map(([v, t, h]) =>
            <Opt key={v} title={t} hint={h} on={a.sex === v} onClick={() => next({ sex: v })} />)}
        </>}
        {step === 'aim' && <>
          <div className="caption">Вопрос 2</div><h1>Чего хочешь добиться?</h1>
          {AIMS.map(x => <Opt key={x.id} title={x.title} hint={x.hint} art={x.art} on={a.aim === x.id} onClick={() => next({ aim: x.id as Aim })} />)}
        </>}
        {step === 'days' && <>
          <div className="caption">Вопрос 3</div><h1>Сколько раз в неделю готов ходить в зал?</h1>
          <div className="onb-days">
            {([2, 3, 4, 5] as const).map(d => (
              <button key={d} className={a.days === d ? 'on' : ''} onClick={() => next({ days: d })}><b>{d}</b><span>{d === 2 ? 'раза' : d < 5 ? 'раза' : 'раз'}</span></button>
            ))}
          </div>
          <p className="muted small">Начинающим хватает 2–3 тренировок. Главное — регулярно.</p>
        </>}
        {step === 'split' && <>
          <div className="caption">Вопрос 4</div><h1>Как хочешь тренироваться?</h1>
          {SPLITS.map(x => <Opt key={x.id} title={x.title} hint={x.hint} on={a.split === x.id} badge={x.id === rec ? 'подходит' : undefined} onClick={() => next({ split: x.id as Split })} />)}
          <Opt title="Не знаю — подбери сам" hint="Задам ещё пару вопросов" art="whistle" on={a.split === 'auto'} onClick={() => next({ split: 'auto' })} />
        </>}
        {step === 'level' && <>
          <div className="caption">Ещё немного</div><h1>Как давно тренируешься?</h1>
          {([[0, 'Только начинаю', 'Меньше полугода — начнём с тренажёров'], [1, 'От полугода до 2 лет', 'Знаю базовые упражнения'], [3, 'Больше 2 лет', 'Уверенно работаю со штангой']] as [Level, string, string][]).map(([v, t, h]) =>
            <Opt key={v} title={t} hint={h} on={a.level === v} onClick={() => next({ level: v })} />)}
        </>}
        {step === 'minutes' && <>
          <div className="caption">Последний вопрос</div><h1>Сколько времени на одну тренировку?</h1>
          {([[45, 'Около 45 минут', '4 упражнения'], [60, 'Около часа', '5 упражнений'], [90, 'Полтора часа', '6 упражнений']] as [45 | 60 | 90, string, string][]).map(([v, t, h]) =>
            <Opt key={v} title={t} hint={h} on={a.minutes === v} onClick={() => next({ minutes: v })} />)}
        </>}
        {step === 'result' && <>
          <Art name="trophy" size={120} className="onb-hero" />
          <h1>Твоя программа готова</h1>
          <p className="muted">{SPLITS.find(x => x.id === (a.split === 'auto' ? recommend(a.days, a.level, a.sex) : a.split))!.title} · {a.days} {a.days < 5 ? 'дня' : 'дней'} в неделю.
            Веса подберём на первой тренировке — я подскажу. Поменять дни и упражнения можно в «Календаре».</p>
          {plan.map((d, i) => (
            <div key={d.dayOfWeek} className="onb-day" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="between"><b>{d.title}</b><span className="pill">{DAY_SHORT[d.dayOfWeek - 1]}</span></div>
              <div className="muted small">{d.exercises.join(' · ')}</div>
            </div>
          ))}
          <button className="btn block big shine" disabled={saving} onClick={finish}>{saving ? 'Сохраняю…' : 'Начать с этой программой'}</button>
          <button className="link block-link" onClick={() => { setDir('back'); setTrail(['hello', 'sex']) }}>Ответить заново</button>
        </>}
      </div>
    </div>
  )
}
