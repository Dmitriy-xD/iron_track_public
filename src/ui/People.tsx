import { useState } from 'react'
import { formatDateTime } from '../analytics/dates'
import { LoggedSet, WORKING, exerciseRecords, fmt1, formatKg, tonnageGrams } from '../analytics/metrics'
import { canonical } from '../analytics/catalog'
import { Dataset, Row } from '../data/api'
import { Kpi, Modal, SheetHeader } from './common'

const toLogged = (s: Row): LoggedSet => ({ weightGrams: Number(s.weight_grams), reps: s.reps, implements: s.implements, kind: s.kind, exercise: s.exercise, createdAt: Number(s.created_at), rir: s.rir, goal: s.goal, sessionId: s.session_id })

export function durationText(start: number, end: number | null): string {
  if (end == null) return 'не завершена'
  const min = Math.round((end - start) / 60000)
  return min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min} мин`
}

/** Read-only view of someone's training (trainer → client, admin → any user). */
export function UserDataView({ data, onEditSession }: { data: Dataset; onEditSession?: (s: Row) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const sessions = [...data.sessions].sort((a, b) => b.started_at - a.started_at)
  const logged = data.sets.map(toLogged)
  const monthAgo = Date.now() - 28 * 86_400_000
  const recentSets = logged.filter(s => (s.createdAt ?? 0) >= monthAgo)
  const records = exerciseRecords(logged).sort((a, b) => b.bestE1rmKg - a.bestE1rmKg).slice(0, 8)
  const lastWeight = [...data.measurements].filter(m => m.weight_grams != null).sort((a, b) => a.epoch_day - b.epoch_day).at(-1)
  const p = data.profile
  return (
    <>
      {p && (p.goal || p.notes || p.height_cm) && (
        <div className="card">
          <div className="muted small">Профиль</div>
          <div>{[p.birth_year && `${new Date().getFullYear() - p.birth_year} лет`, p.height_cm && `${p.height_cm} см`, lastWeight && `${formatKg(Number(lastWeight.weight_grams))} кг`, p.experience_years != null && `стаж ${p.experience_years} г.`].filter(Boolean).join(' • ')}</div>
          {p.goal && <div style={{ marginTop: 6 }}><span className="muted small">Цель: </span>{p.goal}</div>}
        </div>
      )}
      <div className="grid2">
        <Kpi label="Тренировок всего" value={String(sessions.length)} />
        <Kpi label="Тоннаж за 4 недели" value={`${formatKg(Math.trunc(tonnageGrams(recentSets) / 1000) * 1000)} кг`} />
      </div>
      {records.length > 0 && (
        <div className="card">
          <h3>Лучшие результаты (расчётный 1ПМ)</h3>
          {records.map(r => <div key={r.exercise} className="between" style={{ padding: '3px 0' }}><span>{r.exercise}</span><b>≈{fmt1(r.bestE1rmKg)} кг <span className="muted small">({formatKg(r.weightGrams)}×{r.reps})</span></b></div>)}
        </div>
      )}
      {data.plan_days.length > 0 && (
        <div className="card">
          <h3>План</h3>
          {[...data.plan_days].sort((a, b) => a.day_of_week - b.day_of_week).map(d => (
            <div key={d.day_of_week} style={{ padding: '3px 0' }}><b>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d.day_of_week - 1]} · {d.title}</b><div className="muted small">{String(d.exercises).split('\n').filter(Boolean).join(' • ')}</div></div>
          ))}
        </div>
      )}
      <div className="card">
        <h3>Тренировки</h3>
        {!sessions.length && <p className="muted">Пока нет тренировок.</p>}
        {sessions.slice(0, 60).map(s => {
          const sets = data.sets.filter(x => x.session_id === s.id).sort((a, b) => a.created_at - b.created_at)
          const work = sets.filter(x => x.kind === WORKING)
          const long = s.finished_at != null && s.finished_at - s.started_at > 4 * 3_600_000
          return (
            <div key={s.id} className="list-item" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <div className="between">
                <div><b>{s.title || 'Свободная тренировка'}</b><div className="muted small">{formatDateTime(s.started_at)} • <span className={long ? 'danger' : ''}>{durationText(s.started_at, s.finished_at)}</span></div></div>
                <div className="muted small" style={{ textAlign: 'right' }}>{work.length} подх.<br />{formatKg(tonnageGrams(work.map(toLogged)))} кг</div>
              </div>
              {open === s.id && (
                <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  {groupBy(sets).map(([ex, list]) => (
                    <div key={ex} style={{ marginBottom: 6 }}>
                      <div style={{ color: 'var(--orange)' }}>{canonical(ex)}</div>
                      <div className="small">{list.map(x => `${formatKg(Number(x.weight_grams))}${x.implements > 1 ? '×2' : ''}×${x.reps}${x.rir != null ? ` (RIR ${x.rir})` : ''}${x.kind !== WORKING ? ' разм.' : ''}`).join(', ')}</div>
                    </div>
                  ))}
                  {onEditSession && <button className="link" onClick={() => onEditSession(s)}>Изменить время</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function groupBy(sets: Row[]): [string, Row[]][] {
  const m = new Map<string, Row[]>()
  for (const s of sets) m.set(s.exercise, [...(m.get(s.exercise) ?? []), s])
  return [...m.entries()]
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const timeInput = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

/**
 * Fix the start and end of a workout (e.g. it was never finished and ran for 20 hours).
 * [suggestEnd] is offered as the end time — usually the last set + 5 minutes.
 */
export function SessionTimeEditor({ startedAt, finishedAt, suggestEnd, onSave, onClose }: {
  startedAt: number; finishedAt: number | null; suggestEnd?: number | null
  onSave: (start: number, end: number) => Promise<void>; onClose: () => void
}) {
  const end0 = finishedAt ?? suggestEnd ?? startedAt + 3_600_000
  const [date, setDate] = useState(dateInput(startedAt))
  const [start, setStart] = useState(timeInput(startedAt))
  const [end, setEnd] = useState(timeInput(end0))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const compute = () => {
    const [y, m, d] = date.split('-').map(Number)
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const s = new Date(y, m - 1, d, sh, sm).getTime()
    let e = new Date(y, m - 1, d, eh, em).getTime()
    if (e <= s) e += 86_400_000 // finished after midnight
    return [s, e] as const
  }
  const save = async () => {
    const [s, e] = compute()
    if (!Number.isFinite(s) || !Number.isFinite(e)) return setError('Проверь дату и время')
    if (e - s > 6 * 3_600_000) return setError('Больше 6 часов — проверь время окончания')
    setBusy(true)
    try { await onSave(s, e); onClose() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const [s, e] = compute()
  return (
    <Modal onClose={onClose}>
      <SheetHeader title="Время тренировки" onClose={onClose} />
      <label>Дата</label><input type="date" value={date} onChange={x => setDate(x.target.value)} />
      <div className="grid2" style={{ marginTop: 8 }}>
        <div><label>Начало</label><input type="time" value={start} onChange={x => setStart(x.target.value)} /></div>
        <div><label>Конец</label><input type="time" value={end} onChange={x => setEnd(x.target.value)} /></div>
      </div>
      {suggestEnd && <button className="link" onClick={() => setEnd(timeInput(suggestEnd))}>Конец по последнему подходу ({timeInput(suggestEnd)})</button>}
      <p className="muted">Длительность: {Number.isFinite(e - s) ? durationText(s, e) : '—'}</p>
      {error && <p className="danger">{error}</p>}
      <button className="btn block" disabled={busy} onClick={save}>Сохранить</button>
    </Modal>
  )
}
