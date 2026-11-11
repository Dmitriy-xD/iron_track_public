import { useState } from 'react'
import { canonicalKey } from '../analytics/catalog'
import { DAY_FULL, DAY_SHORT, MONTHS, formatDateTime, formatDay, fromYmd, isoDow, localDay, plural, today as todayDay } from '../analytics/dates'
import { completedWorkingSets, formatKg, tonnageGrams } from '../analytics/metrics'
import { useStore } from '../data/store'
import { PlanDayRow, WSet, planExercises, planGoals } from '../data/types'
import { GOALS, TrainingGoal } from '../analytics/goal'
import { Modal, MuscleLine, SheetHeader } from './common'
import { ExercisePicker } from './ExercisePicker'
import { SetEditor, SetRow } from './Workout'
import { SessionTimeEditor, durationText } from './People'
import { Icon } from './icons'
import { ask } from './motion'

export function Calendar() {
  const store = useStore()
  const { db } = store
  const t = todayDay()
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const [selected, setSelected] = useState(t)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editingSet, setEditingSet] = useState<WSet | null>(null)
  const [editingTime, setEditingTime] = useState<string | null>(null)
  const first = fromYmd(ym.y, ym.m, 1)
  const daysIn = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate()
  const lead = isoDow(first) - 1
  const byDay = new Map<number, typeof db.sessions>()
  for (const s of db.sessions) { const d = localDay(s.startedAt); byDay.set(d, [...(byDay.get(d) ?? []), s]) }
  const planFor = (d: number) => db.plan.find(p => p.dayOfWeek === isoDow(d))
  const shift = (k: number) => setYm(({ y, m }) => { const mm = m + k; return mm < 1 ? { y: y - 1, m: 12 } : mm > 12 ? { y: y + 1, m: 1 } : { y, m: mm } })
  const plan = planFor(selected)
  const done = byDay.get(selected) ?? []

  return (
    <>
      <h1>Календарь</h1>
      <div className="card">
        <div className="between"><button className="icon-btn" onClick={() => shift(-1)} aria-label="Назад"><Icon.back /></button><b style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>{MONTHS[ym.m - 1]} {ym.y}</b><button className="icon-btn" onClick={() => shift(1)} aria-label="Вперёд"><Icon.chevron /></button></div>
        <div className="month" style={{ marginTop: 8 }}>
          {DAY_SHORT.map(d => <div key={d} className="h">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={'e' + i} />)}
          {Array.from({ length: daysIn }, (_, i) => {
            const d = first + i, isDone = byDay.has(d), planned = !!planFor(d), missed = planned && !isDone && d < t
            return (
              <div key={d} className="d" onClick={() => setSelected(d)} style={{
                background: isDone ? 'var(--grad)' : planned && d >= t ? 'rgba(255,138,61,.14)' : 'transparent',
                color: isDone ? '#1A0A00' : missed ? 'var(--bad)' : d < t ? 'var(--muted)' : 'var(--text)',
                fontWeight: isDone || d === t ? 800 : 500,
                boxShadow: d === selected ? '0 0 0 2px var(--text)' : d === t ? 'inset 0 0 0 1.5px var(--orange)' : isDone ? '0 6px 16px -8px rgba(255,96,30,.9)' : 'none'
              }}>{i + 1}</div>
            )
          })}
        </div>
        <div className="row small muted" style={{ marginTop: 12, gap: 14 }}><span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--grad)' }} />сделано</span><span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,138,61,.3)' }} />в плане</span><span className="row danger" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--bad)' }} />пропуск</span></div>
      </div>
      <div className="card">
        <h2>{formatDay(selected)} • {DAY_SHORT[isoDow(selected) - 1]}</h2>
        {plan ? <><b style={{ color: 'var(--orange)' }}>План: {plan.title}</b><div className="muted small">{planExercises(plan).join(' • ')}</div></> : <div className="muted">По плану — день отдыха</div>}
        {!done.length && plan && selected < t && <p className="danger">Тренировка пропущена</p>}
        {done.map(s => {
          const sets = db.sets.filter(x => x.sessionId === s.id)
          const groups = new Map<string, WSet[]>()
          for (const x of sets) groups.set(canonicalKey(x.exercise), [...(groups.get(canonicalKey(x.exercise)) ?? []), x])
          return (
            <div key={s.id} style={{ borderTop: '1px solid var(--s2)', marginTop: 10, paddingTop: 10 }}>
              <div className="between">
                <div><b>{s.title ?? 'Свободная тренировка'}</b><div className="muted small">{formatDateTime(s.startedAt)} • <span className={s.finishedAt != null && s.finishedAt - s.startedAt > LONG_MS ? 'danger' : ''}>{durationText(s.startedAt, s.finishedAt)}</span> • {completedWorkingSets(sets)} подходов • {formatKg(tonnageGrams(sets))} кг</div></div>
                {s.finishedAt != null && <div className="row">
                  <button className="link small" onClick={() => setEditingTime(s.id)}>Время</button>
                  <button className="danger small" onClick={async () => { if (await ask('Удалить тренировку?', { text: `Вместе с ней удалятся ${sets.length} подходов.`, ok: 'Удалить', danger: true })) store.deleteSession(s.id) }}>Удалить</button>
                </div>}
              </div>
              {[...groups.values()].map(g => <div key={g[0].id}><b style={{ color: 'var(--orange)' }}>{store.resolve(g[0].exercise).name}</b>{g.map((x, i) => <SetRow key={x.id} n={i + 1} s={x} onClick={() => setEditingSet(x)} />)}</div>)}
            </div>
          )
        })}
      </div>
      <div className="section-title"><h2>План на неделю</h2></div>
      {[1, 2, 3, 4, 5, 6, 7].map(d => {
        const p = db.plan.find(x => x.dayOfWeek === d)
        const unknown = p ? planExercises(p).filter(n => store.resolve(n).primary === 'OTHER').length : 0
        const n = p ? planExercises(p).length : 0
        return (
          <div key={d} className="list-item row" onClick={() => setEditingDay(d)}>
            <b style={{ width: 36, color: p ? 'var(--orange)' : 'var(--muted)' }}>{DAY_SHORT[d - 1]}</b>
            <div className="grow"><div style={{ fontWeight: p ? 700 : 400 }}>{p?.title ?? 'Отдых'}</div>
              {p && <div className="muted small">{n} {plural(n, 'упражнение', 'упражнения', 'упражнений')}{unknown > 0 && <span className="danger"> • ⚠ уточни {unknown}</span>}</div>}</div>
            <span className="muted"><Icon.edit /></span>
          </div>
        )
      })}
      {editingDay != null && <PlanEditor day={editingDay} existing={db.plan.find(p => p.dayOfWeek === editingDay)} onClose={() => setEditingDay(null)} />}
      {editingSet && <SetEditor set={editingSet} onClose={() => setEditingSet(null)} />}
      {editingTime && <EditSessionTime sessionId={editingTime} onClose={() => setEditingTime(null)} />}
    </>
  )
}

/** Workouts longer than this are almost certainly a forgotten "finish". */
export const LONG_MS = 4 * 3_600_000

/** Last set + 5 min: a sensible end for a workout that was never finished. */
export function suggestedEnd(sets: WSet[], startedAt: number): number | null {
  const last = Math.max(...sets.map(s => s.createdAt), 0)
  return last > startedAt ? last + 5 * 60_000 : null
}

export function EditSessionTime({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const store = useStore()
  const s = store.db.sessions.find(x => x.id === sessionId)
  if (!s) return null
  return (
    <SessionTimeEditor startedAt={s.startedAt} finishedAt={s.finishedAt}
      suggestEnd={suggestedEnd(store.db.sets.filter(x => x.sessionId === s.id), s.startedAt)}
      onSave={(a, b) => store.editSessionTimes(s.id, a, b)} onClose={onClose} />
  )
}

/** Banner for a workout that ran for hours (forgot to press "finish"): one tap to fix the time. */
export function LongSessionWarning({ sessionId }: { sessionId: string }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const s = store.db.sessions.find(x => x.id === sessionId)
  if (!s || s.finishedAt == null) return null
  return (
    <div className="warn">
      <b>Тренировка шла {durationText(s.startedAt, s.finishedAt)}</b>
      <div className="muted small">{s.title ?? 'Свободная тренировка'}, {formatDateTime(s.startedAt)}. Похоже, её забыли завершить — это искажает статистику.</div>
      <button className="link" onClick={() => setOpen(true)}>Исправить время</button>
      {open && <EditSessionTime sessionId={s.id} onClose={() => setOpen(false)} />}
    </div>
  )
}

function PlanEditor({ day, existing, onClose }: { day: number; existing?: PlanDayRow; onClose: () => void }) {
  const store = useStore()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [list, setList] = useState<string[]>(existing ? planExercises(existing) : [])
  const [goals, setGoals] = useState<TrainingGoal[]>(existing ? planGoals(existing) : [])
  const cycleGoal = (i: number) => setGoals(g => g.map((x, j) => (j === i ? GOALS[(GOALS.findIndex(o => o.id === x) + 1) % GOALS.length].id : x)))
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  const unknown = list.filter(n => store.resolve(n).primary === 'OTHER').length
  const shift = <T,>(l: T[], i: number, k: number) => { const c = [...l]; const [x] = c.splice(i, 1); c.splice(i + k, 0, x); return c }
  const move = (i: number, k: number) => { setList(l => shift(l, i, k)); setGoals(g => shift(g, i, k)) }
  const save = async () => {
    const names = list.map(n => { const e = store.resolve(n); return e.primary !== 'OTHER' && !e.custom ? e.name : n.trim() })
    await store.savePlanDay({ dayOfWeek: day, title: title.trim() || 'Тренировка', exercises: names.join('\n'), goals: list.map((_, i) => goals[i] ?? 'hypertrophy').join('\n') })
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <SheetHeader title={DAY_FULL[day - 1]} onClose={onClose} />
      <label>Название тренировки</label>
      <input value={title} placeholder="Грудь + трицепс" onChange={e => setTitle(e.target.value)} />
      {unknown > 0 && <div className="warn" style={{ marginTop: 10 }}><b>Уточни {unknown} {plural(unknown, 'упражнение', 'упражнения', 'упражнений')}</b><div className="muted small">Для них не указано, какие мышцы они качают — аналитика их не учитывает.</div></div>}
      <div style={{ marginTop: 10 }}>
        {list.map((n, i) => {
          const e = store.resolve(n)
          return (
            <div key={i + n} className="list-item row" style={{ cursor: 'default' }}>
              <span className="muted" style={{ width: 20 }}>{i + 1}</span>
              <div className="grow"><div>{e.primary !== 'OTHER' ? e.name : n}</div><MuscleLine ex={e} />{e.primary === 'OTHER' && <button className="link small" onClick={() => setPickerFor(i)}>Уточнить →</button>}
                <button className="link small" onClick={() => cycleGoal(i)}>Цель: {GOALS.find(g => g.id === (goals[i] ?? 'hypertrophy'))!.title} ⟳</button></div>
              <button disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button disabled={i === list.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="muted" onClick={() => { setList(l => l.filter((_, j) => j !== i)); setGoals(g => g.filter((_, j) => j !== i)) }}>✕</button>
            </div>
          )
        })}
        <button className="btn ghost block" onClick={() => setPickerFor(-1)}>＋ Добавить упражнение</button>
      </div>
      <button className="btn block" style={{ marginTop: 12 }} disabled={unknown > 0 || !list.length} onClick={save}>{unknown > 0 ? 'Сначала уточни упражнения' : 'Сохранить план'}</button>
      {existing && <button className="danger block" style={{ width: '100%', padding: 12 }} onClick={async () => { await store.deletePlanDay(day); onClose() }}>Сделать днём отдыха</button>}
      {pickerFor != null && (
        <ExercisePicker
          title={pickerFor >= 0 ? 'Что это за упражнение?' : 'Добавить в план'}
          initialQuery={pickerFor >= 0 ? list[pickerFor] : ''}
          onPick={name => { setList(l => (pickerFor >= 0 ? l.map((x, j) => (j === pickerFor ? name : x)) : [...l, name])); if (pickerFor < 0) setGoals(g => [...g, 'hypertrophy']); setPickerFor(null) }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </Modal>
  )
}
