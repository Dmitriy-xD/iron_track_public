// Port of WeeklyReview.kt.
import { CatalogExercise, MuscleId, OTHER, SELECTABLE_MUSCLES, CATALOG, canonical, canonicalKey, muscleIndex, muscleTitle } from './catalog'
import { Day, DayOf, isoDow, plural, weekStart } from './dates'
import { ExerciseStat, MuscleVolume, adherence as adherenceOf, exerciseDays, exerciseStats, muscleVolume } from './insights'
import { LoggedSet, WORKING, completedWorkingSets, exerciseRecords, tonnageGrams } from './metrics'
import { suggest } from './progression'
import { CoachPage, buildCoaching } from './coaching'

export interface PlanDay { dayOfWeek: number; title: string; exercises: string[]; goals?: string[] }
export interface RecordNote { exercise: string; e1rmKg: number; previousKg: number | null }
export interface Note { text: string; detail?: string }
export interface WeeklyReview {
  weekStart: Day; weekEnd: Day; isCurrentWeek: boolean
  workouts: number; plannedDays: number; doneDays: number; missedDays: number[]
  tonnageGrams: number; previousTonnageGrams: number; workingSets: number; previousWorkingSets: number
  avgMinutes: number | null; avgRir: number | null; failureShare: number | null
  records: RecordNote[]; topExercises: ExerciseStat[]; muscles: MuscleVolume[]
  good: Note[]; improve: Note[]; recommendations: Note[]; score: number; tonnageChangePct: number | null
  coaching: CoachPage[]
}

const DAY_SHORT_LOWER = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const fmt = (v: number) => v.toFixed(1)
const fmtSets = (v: number) => (v % 1 === 0 ? String(v) : fmt(v))

export function buildWeeklyReview(args: {
  sets: LoggedSet[]; sessions: [number, number | null][]; plan: PlanDay[]
  resolve: (n: string) => CatalogExercise; weekStart: Day; today: Day; dayOf: DayOf; bodyweightDays?: Day[]; bodyweightKg?: number | null
}): WeeklyReview {
  const { sets, sessions, plan, resolve, today, dayOf } = args
  const start = weekStart(args.weekStart)
  const end = start + 6
  const isCurrent = today >= start && today <= end
  const lastCounted = Math.min(end, today)
  const inWeek = (ms: number, s = start, e = end) => { const d = dayOf(ms); return d >= s && d <= e }

  const weekSets = sets.filter(s => inWeek(s.createdAt ?? 0))
  const prevSets = sets.filter(s => inWeek(s.createdAt ?? 0, start - 7, start - 1))
  const weekWorking = weekSets.filter(s => (s.kind ?? WORKING) === WORKING && s.reps > 0)
  const weekSessions = sessions.filter(([st]) => inWeek(st))
  const workoutDates = new Set(weekSessions.map(([st]) => dayOf(st)))
  const plannedDays = new Set(plan.map(p => p.dayOfWeek))
  const adh = adherenceOf(plannedDays, workoutDates, start, end, today, isoDow)
  const missed: number[] = []
  for (let d = start; d <= lastCounted; d++) if (plannedDays.has(isoDow(d)) && !workoutDates.has(d) && d < today) missed.push(isoDow(d))

  const tonnage = tonnageGrams(weekSets), prevTonnage = tonnageGrams(prevSets)
  const workingSets = completedWorkingSets(weekSets), prevWorkingSets = completedWorkingSets(prevSets)
  const minutes = weekSessions.filter(([, f]) => f != null).map(([s, f]) => Math.trunc((f! - s) / 60_000)).filter(m => m >= 5 && m <= 300)
  const rirs = weekWorking.map(s => s.rir).filter((r): r is number => r != null)
  const avgRir = rirs.length >= 3 ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null
  const failureShare = rirs.length >= 3 ? Math.trunc(rirs.filter(r => r === 0).length * 100 / rirs.length) : null

  const before = new Map(exerciseRecords(sets.filter(s => dayOf(s.createdAt ?? 0) < start)).map(r => [canonicalKey(r.exercise), r]))
  const records = exerciseRecords(weekSets).flatMap(r => {
    const prev = before.get(canonicalKey(r.exercise))
    return !prev || r.bestE1rmKg > prev.bestE1rmKg + 0.05 ? [{ exercise: r.exercise, e1rmKg: r.bestE1rmKg, previousKg: prev?.bestE1rmKg ?? null }] : []
  }).sort((a, b) => (b.e1rmKg - (b.previousKg ?? b.e1rmKg)) - (a.e1rmKg - (a.previousKg ?? a.e1rmKg)))

  const stats = exerciseStats(sets, resolve, start, end, dayOf)
  const muscles = muscleVolume(sets, resolve, start, end, dayOf)
  const known = muscles.filter(m => m.muscle !== OTHER)
  const eff = (m: MuscleId) => known.find(v => v.muscle === m)?.effective ?? 0
  const plannedMuscles = [...new Set(plan.flatMap(p => p.exercises).map(n => resolve(n).primary).filter(m => m !== OTHER))]

  const good: Note[] = [], improve: Note[] = [], recs: Note[] = []

  if (adh.planned > 0) {
    if (adh.percent >= 100) good.push({ text: `План выполнен полностью: ${adh.done} из ${adh.planned} 🔥`, detail: 'Регулярность — главный фактор прогресса.' })
    else if (adh.percent >= 75) good.push({ text: `Почти весь план: ${adh.done} из ${adh.planned} тренировок` })
    else improve.push({ text: `Выполнено ${adh.done} из ${adh.planned} тренировок по плану`, detail: missed.length ? 'Пропуски: ' + missed.map(d => DAY_SHORT_LOWER[d - 1]).join(', ') : undefined })
  } else if (weekSessions.length) {
    good.push({ text: `${weekSessions.length} ${plural(weekSessions.length, 'тренировка', 'тренировки', 'тренировок')} за неделю` })
  }
  if (missed.length >= 2) recs.push({ text: 'Включи напоминания', detail: 'В приложении: Профиль → Настройки → «Напоминать о тренировке».' })

  const change = prevTonnage > 0 ? Math.trunc((tonnage - prevTonnage) * 100 / prevTonnage) : null
  if (change != null && !isCurrent) {
    if (change >= 5) good.push({ text: `Тоннаж вырос на ${change}% к прошлой неделе` })
    else if (change <= -20) improve.push({ text: `Тоннаж ниже прошлой недели на ${-change}%`, detail: 'Нормально для разгрузки; если нет — проверь сон и восстановление.' })
  }

  if (records.length) {
    good.push({
      text: 'Новые рекорды: ' + records.slice(0, 3).map(r => r.exercise).join(', '),
      detail: records.slice(0, 3).map(r => `${r.exercise}: ≈${fmt(r.e1rmKg)} кг` + (r.previousKg != null ? ` (было ${fmt(r.previousKg)})` : ' (первый результат)')).join('\n')
    })
  }

  const judgeVolume = !isCurrent || isoDow(today) >= 4
  const inZone = known.filter(v => v.effective >= 10 && v.effective <= 20)
  if (inZone.length) good.push({ text: 'В зоне роста (10–20 подходов): ' + inZone.map(v => muscleTitle(v.muscle).toLowerCase()).join(', ') })
  if (judgeVolume) {
    const low = plannedMuscles.filter(m => eff(m) < 10).sort((a, b) => muscleIndex(a) - muscleIndex(b))
    if (low.length) {
      improve.push({ text: 'Мало подходов: ' + low.map(m => `${muscleTitle(m).toLowerCase()} (${fmtSets(eff(m))})`).join(', '), detail: 'Ориентир для роста — 10–20 эффективных подходов в неделю на мышцу.' })
      for (const m of low.slice(0, 2)) {
        const need = Math.min(6, Math.round(Math.max(2, 10 - eff(m))))
        const example = plan.flatMap(p => p.exercises).map(resolve).find(e => e.primary === m)?.name ?? CATALOG.find(e => e.primary === m)?.name
        recs.push({ text: `Добавь ~${need} подх. на ${muscleTitle(m).toLowerCase()}`, detail: example ? `Например: ${example} — по 1–2 подхода в тренировку.` : undefined })
      }
    }
    const high = known.filter(v => v.effective > 22)
    if (high.length) improve.push({ text: 'Очень большой объём: ' + high.map(v => `${muscleTitle(v.muscle).toLowerCase()} (${fmtSets(v.effective)})`).join(', '), detail: 'Больше 20 подходов редко даёт дополнительный рост, но копит усталость.' })
  }
  const other = muscles.find(v => v.muscle === OTHER)
  if (other) improve.push({ text: `${other.direct} подходов без указанных мышц`, detail: 'Уточни упражнения: ' + other.contributions.map(c => c.exercise).join(', ') })

  if (avgRir != null) {
    if (failureShare != null && failureShare >= 40) {
      improve.push({ text: `${failureShare}% подходов в отказ (RIR 0)`, detail: 'Частый отказ сильно утомляет и мешает добавлять повторы.' })
      recs.push({ text: 'Оставляй 1–2 повтора в запасе', detail: 'Отказ — только в последнем подходе изолирующих упражнений.' })
    } else if (avgRir >= 0.8 && avgRir <= 3.2) good.push({ text: `Хорошая интенсивность: средний запас ${fmt(avgRir)} повт.` })
    else if (avgRir > 3.2) {
      improve.push({ text: `Большой запас повторов (RIR ≈ ${fmt(avgRir)})`, detail: 'Для роста лучше работать ближе к отказу: 1–3 повтора в запасе.' })
      recs.push({ text: 'Добавь вес или повторы', detail: 'Подсказки на экране тренировки покажут, где именно.' })
    }
  } else if (weekWorking.length) recs.push({ text: 'Отмечай RIR', detail: 'Запас повторов помогает точнее подсказывать, когда добавлять вес.' })

  const fourWeeks = sets.filter(s => { const d = dayOf(s.createdAt ?? 0); return d >= start - 21 && d <= end })
  const byEx = new Map<string, LoggedSet[]>()
  for (const s of fourWeeks) { const k = canonicalKey(s.exercise ?? ''); byEx.set(k, [...(byEx.get(k) ?? []), s]) }
  const stalled: string[] = []
  for (const list of byEx.values()) {
    const days = exerciseDays(list, list[0].exercise ?? '', dayOf).filter(d => d.bestE1rmKg != null)
    if (days.length < 3) continue
    const firstBest = days[0].bestE1rmKg!
    const laterBest = Math.max(...days.slice(1).map(d => d.bestE1rmKg!))
    if (laterBest <= firstBest + 0.05) stalled.push(canonical(list[0].exercise ?? ''))
  }
  if (stalled.length) improve.push({ text: 'Без прогресса 3+ тренировки: ' + stalled.slice(0, 3).join(', '), detail: 'Попробуй сменить диапазон повторов или вариант упражнения на 3–4 недели.' })

  const seen = new Set<string>()
  const next: Note[] = []
  for (const name of plan.flatMap(p => p.exercises)) {
    const k = canonicalKey(name); if (seen.has(k)) continue; seen.add(k)
    const ex = resolve(name); if (ex.primary === OTHER) continue
    const days = exerciseDays(sets.filter(s => dayOf(s.createdAt ?? 0) <= end), name, dayOf).filter(d => d.workingSets > 0)
    if (!days.length) continue
    const hint = suggest(ex, days[days.length - 1])
    if (hint.kind !== 'FIRST_TIME') next.push({ text: `${ex.name}: ${hint.title.charAt(0).toLowerCase()}${hint.title.slice(1)}` })
  }
  next.sort((a, b) => (a.text.includes('добавить вес') ? 0 : 1) - (b.text.includes('добавить вес') ? 0 : 1))
  recs.push(...next.slice(0, 5))

  if (!(args.bodyweightDays ?? []).some(d => d >= start && d <= end)) recs.push({ text: 'Взвесься и запиши вес', detail: 'Профиль → Замеры тела. Раз в неделю утром натощак.' })
  if (!good.length && weekSessions.length) good.push({ text: 'Тренировка записана — это уже шаг вперёд 💪' })

  const consistency = adh.planned > 0 ? Math.min(adh.percent, 100) * 0.5 : weekSessions.length ? 40 : 0
  const volumeScore = plannedMuscles.length === 0 ? (inZone.length ? 30 : 15) : 30 * plannedMuscles.filter(m => eff(m) >= 10).length / plannedMuscles.length
  const progressScore = records.length ? 20 : change != null && change > 0 ? 12 : weekWorking.length ? 8 : 0
  const score = Math.max(0, Math.min(100, Math.round(consistency + volumeScore + progressScore)))

  return {
    weekStart: start, weekEnd: end, isCurrentWeek: isCurrent, workouts: weekSessions.length,
    plannedDays: adh.planned, doneDays: adh.done, missedDays: missed,
    tonnageGrams: tonnage, previousTonnageGrams: prevTonnage, workingSets, previousWorkingSets: prevWorkingSets,
    avgMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    avgRir, failureShare, records, topExercises: stats.slice(0, 3), muscles: known,
    good, improve, recommendations: recs, score,
    tonnageChangePct: prevTonnage > 0 ? Math.trunc((tonnage - prevTonnage) * 100 / prevTonnage) : null,
    coaching: buildCoaching({ sets, sessions, plan, resolve, weekEnd: end, dayOf, bodyweightKg: args.bodyweightKg })
  }
}

export { SELECTABLE_MUSCLES }
