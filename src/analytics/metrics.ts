// Port of TrainingMetrics.kt: pure functions, weights in integer grams.
import { canonical, canonicalKey } from './catalog'

export const WORKING = 'working'
export const WARMUP = 'warmup'
export const MAX_E1RM_REPS = 12

export interface LoggedSet {
  weightGrams: number
  reps: number
  implements?: number
  kind?: string
  exercise?: string
  createdAt?: number
  rir?: number | null
  goal?: string | null
  sessionId?: string
}

export interface ExerciseRecord { exercise: string; bestE1rmKg: number; weightGrams: number; reps: number }

const isWorking = (s: LoggedSet) => (s.kind ?? WORKING) === WORKING

export function tonnageGrams(sets: LoggedSet[]): number {
  let total = 0
  for (const s of sets) {
    if (!isWorking(s)) continue
    total += s.weightGrams * s.reps * (s.implements ?? 1)
  }
  return total
}

export const tonnageSinceGrams = (sets: LoggedSet[], since: number) => tonnageGrams(sets.filter(s => (s.createdAt ?? 0) >= since))

export function estimatedOneRepMaxKg(weightKg: number, reps: number): number {
  if (!(weightKg >= 0) || !Number.isFinite(weightKg) || reps < 1 || reps > MAX_E1RM_REPS) throw new Error('e1RM: 1–12 reps')
  return weightKg * (1 + reps / 30)
}

export const completedWorkingSets = (sets: LoggedSet[]) => sets.filter(s => isWorking(s) && s.reps > 0).length

export function exerciseRecords(sets: LoggedSet[]): ExerciseRecord[] {
  const groups = new Map<string, LoggedSet[]>()
  for (const s of sets) {
    if (!isWorking(s) || s.reps < 1 || s.reps > MAX_E1RM_REPS || !(s.exercise ?? '').trim()) continue
    const k = canonicalKey(s.exercise!)
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  return [...groups.values()].map(group => {
    const best = group.reduce((a, b) => (e1(b) > e1(a) ? b : a))
    return { exercise: canonical(group[0].exercise!), bestE1rmKg: e1(best), weightGrams: best.weightGrams, reps: best.reps }
  }).sort((a, b) => a.exercise.toLowerCase().localeCompare(b.exercise.toLowerCase()))
}

const e1 = (s: LoggedSet) => estimatedOneRepMaxKg(s.weightGrams / 1000, s.reps)

/** 55500 -> "55.5", 1980000 -> "1980" (no floating point artefacts). */
export function formatKg(grams: number): string {
  const neg = grams < 0
  const g = Math.abs(Math.round(grams))
  const whole = Math.floor(g / 1000)
  const frac = String(g % 1000).padStart(3, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

/** "52,5" / "52.5" -> 52500; null if invalid, negative, > 1000 kg or more than 3 decimals. */
export function parseKgToGrams(input: string): number | null {
  const t = input.trim().replace(',', '.')
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(t)
  if (!m) return null
  const grams = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0') || 0)
  return grams > 1_000_000 ? null : grams
}

export const fmt1 = (v: number) => v.toFixed(1)
