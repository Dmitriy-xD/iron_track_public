// Port of Forecast.kt: expected reps for the next set at a chosen weight, and the verdict after it.
import { CatalogExercise } from './catalog'
import { TrainingGoal, floorToStep, goalReps } from './goal'
import { ExerciseDay } from './insights'
import { LoggedSet, WORKING, formatKg } from './metrics'

/** Expected result: [reps] (± 1) with [rir] in reserve; [suggestedWeightGrams] when the weight misses the goal's range. */
export interface SetForecast { weightGrams: number; reps: number; rir: number; basis: string; suggestedWeightGrams?: number | null; note?: string | null }
export const fLow = (f: SetForecast) => Math.max(1, f.reps - 1)
export const fHigh = (f: SetForecast) => f.reps + 1

export type Verdict = 'ABOVE' | 'ON_TARGET' | 'BELOW'
export interface ForecastResult { verdict: Verdict; delta: number; title: string; advice: string }

const MAX_REPS_FOR_ESTIMATE = 20

/** Strength and the heavy combo set keep 2 in reserve, hypertrophy sets 1. */
export const targetRir = (goal: TrainingGoal, comboHeavy: boolean) => (goal === 'strength' ? 2 : goal === 'combo' ? (comboHeavy ? 2 : 1) : 1)

/** e1RM in kg of a set, counting the reps left in reserve (unknown RIR is treated as 1). */
export const capacityKg = (s: LoggedSet) => (s.weightGrams / 1000) * (1 + (s.reps + (s.rir ?? 1)) / 30)

/** Reps doable at [weightGrams] leaving [rir] in reserve (inverse Epley). */
export const repsAt = (e1rmKg: number, weightGrams: number, rir: number) => Math.floor(30 * ((e1rmKg * 1000) / weightGrams - 1) + 1e-6) - rir

const isWorking = (s: LoggedSet) => (s.kind ?? WORKING) === WORKING

export function predict(ex: CatalogExercise, goal: TrainingGoal, weightGrams: number, sessionSets: LoggedSet[],
  lastDay: ExerciseDay | undefined | null, bestE1rmKg: number | null): SetForecast | null {
  const done = sessionSets.filter(s => isWorking(s) && s.reps > 0)
  const comboHeavy = goal === 'combo' && done.length === 0
  const rir = targetRir(goal, comboHeavy)
  const previous = done[done.length - 1]
  // A short rest after a hard set costs about one rep; long strength rests mostly restore it.
  const fatigue = previous && (previous.rir ?? 1) <= 1 && !(goal === 'strength' || comboHeavy) ? 1 : 0

  if (weightGrams <= 0) {
    const reps = previous ? previous.reps - fatigue : lastDay?.sets.find(isWorking)?.reps
    if (reps == null) return null
    return { weightGrams, reps: Math.max(1, reps), rir, basis: previous ? 'по прошлому подходу' : 'по прошлой тренировке' }
  }

  const estimable = (s: LoggedSet) => isWorking(s) && s.reps >= 1 && s.reps <= MAX_REPS_FOR_ESTIMATE && s.weightGrams > 0
  let e1rm: number, basis: string
  if (previous && estimable(previous)) { e1rm = capacityKg(previous); basis = 'по прошлому подходу' }
  else if (lastDay && lastDay.sets.some(estimable)) { e1rm = Math.max(...lastDay.sets.filter(estimable).map(capacityKg)); basis = 'по прошлой тренировке' }
  else if (bestE1rmKg != null && bestE1rmKg > 0) { e1rm = bestE1rmKg; basis = 'по рекорду' }
  else return null

  const raw = repsAt(e1rm, weightGrams, rir) - fatigue
  const reps = Math.min(50, Math.max(1, raw))
  const range = goal === 'combo' && !comboHeavy ? { first: ex.repsMin, last: ex.repsMax } : goalReps(ex, goal)
  const weightFor = (target: number) => floorToStep(Math.trunc((e1rm * 1000) / (1 + (target + rir + fatigue) / 30)), ex.stepGrams)
  if (raw < range.first) {
    const w = weightFor(range.last)
    return { weightGrams, reps, rir, basis, suggestedWeightGrams: w >= 1 && w < weightGrams ? w : null, note: `Тяжеловато для ${range.first}–${range.last} повторов` }
  }
  if (raw > range.last + 1) {
    const w = weightFor(range.first)
    return { weightGrams, reps, rir, basis, suggestedWeightGrams: w > weightGrams ? w : null, note: `Легковато для ${range.first}–${range.last} повторов` }
  }
  return { weightGrams, reps, rir, basis }
}

/** Reps in reserve are counted, so 8 @ RIR 2 equals 9 @ RIR 1. */
export function compare(f: SetForecast, actualReps: number, actualRir: number | null, ex: CatalogExercise, goal: TrainingGoal): ForecastResult {
  const delta = actualReps + (actualRir ?? f.rir) - (f.reps + f.rir)
  const repsDelta = actualReps - f.reps
  const range = goalReps(ex, goal)
  const step = formatKg(ex.stepGrams)
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  if (delta >= 2) return {
    verdict: 'ABOVE', delta, title: `Сильнее прогноза: ${signed(repsDelta)} повт.`,
    advice: actualReps >= range.last ? `Ты на верхней границе ${range.first}–${range.last} — следующий подход или тренировку можно +${step} кг.`
      : `Отличная форма. Держи вес и добирай повторы до ${range.last}.`
  }
  if (delta <= -2) return {
    verdict: 'BELOW', delta, title: `Меньше прогноза: ${signed(repsDelta)} повт.`,
    advice: actualReps < range.first ? `Ниже диапазона ${range.first}–${range.last} — сбрось вес на шаг или отдыхай дольше.`
      : 'Бывает от усталости. Отдохни подольше перед следующим подходом.'
  }
  return { verdict: 'ON_TARGET', delta, title: 'Точно по прогнозу ✓', advice: 'Всё идёт по плану.' }
}
