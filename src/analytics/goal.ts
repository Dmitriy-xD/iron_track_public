// Port of Goal.kt.
import { CatalogExercise } from './catalog'

export type TrainingGoal = 'hypertrophy' | 'strength' | 'combo'
export const GOALS: { id: TrainingGoal; title: string; short: string }[] = [
  { id: 'hypertrophy', title: 'Масса', short: 'М' },
  { id: 'strength', title: 'Сила', short: 'С' },
  { id: 'combo', title: 'Сила + масса', short: 'С+М' }
]
export const parseGoal = (id: string | null | undefined): TrainingGoal => (GOALS.some(g => g.id === id) ? (id as TrainingGoal) : 'hypertrophy')
export const goalTitle = (g: TrainingGoal) => GOALS.find(x => x.id === g)!.title

export interface WarmupSet { weightGrams: number; reps: number }
export interface Range { first: number; last: number }

export const strengthReps = (ex: CatalogExercise): Range => (ex.primary === 'FOREARMS' ? { first: 4, last: 8 } : { first: 3, last: 5 })
export const isIsolation = (ex: CatalogExercise) => ex.repsMin >= 10
export const goalReps = (ex: CatalogExercise, g: TrainingGoal): Range => (g === 'hypertrophy' ? { first: ex.repsMin, last: ex.repsMax } : strengthReps(ex))
export const restSeconds = (ex: CatalogExercise, g: TrainingGoal) => (g === 'hypertrophy' ? (isIsolation(ex) ? 90 : 120) : 180)
export const rirText = (g: TrainingGoal) => (g === 'strength' ? 'запас 1–3, без отказа' : g === 'combo' ? 'тяжёлый с запасом 1–2, добивочные — 0–2' : 'запас 0–2')
export function setsText(ex: CatalogExercise, g: TrainingGoal) {
  const r = goalReps(ex, g)
  if (g === 'strength') return `3–5 подходов × ${r.first}–${r.last}`
  if (g === 'combo') return `1 тяжёлый × ${r.first}–${r.last}, затем 2–3 × ${ex.repsMin}–${ex.repsMax} (−20%)`
  return `2–4 подхода × ${ex.repsMin}–${ex.repsMax}`
}
export const e1rmFraction = (reps: number, rir: number) => 1 / (1 + (reps + rir) / 30)
export const floorToStep = (grams: number, step: number) => (step <= 0 ? grams : Math.floor(grams / step) * step)
export const strengthWeightFromE1rm = (e1rmKg: number, ex: CatalogExercise) =>
  floorToStep(Math.trunc(e1rmKg * 1000 * e1rmFraction(strengthReps(ex).last, 2)), ex.stepGrams)
export const backOffWeight = (topGrams: number, ex: CatalogExercise) => floorToStep(Math.trunc((topGrams * 8) / 10), ex.stepGrams)

export function warmup(workGrams: number, ex: CatalogExercise, g: TrainingGoal): WarmupSet[] {
  if (workGrams < 20000) return []
  const plan: [number, number][] = g !== 'hypertrophy' ? [[40, 8], [60, 5], [75, 3], [85, 1]] : isIsolation(ex) ? [] : [[50, 8], [75, 4]]
  const step = Math.max(ex.stepGrams, 1000)
  const out: WarmupSet[] = []
  for (const [pct, reps] of plan) {
    const w = floorToStep(Math.trunc((workGrams * pct) / 100), step)
    if (w >= 1 && w < workGrams && !out.some(x => x.weightGrams === w)) out.push({ weightGrams: w, reps })
  }
  return out
}
