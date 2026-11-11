// Port of Insights.kt.
import { CatalogExercise, MuscleId, OTHER, canonical, canonicalKey, muscleIndex } from './catalog'
import { Day, DayOf, weekStart } from './dates'
import { LoggedSet, MAX_E1RM_REPS, WORKING, completedWorkingSets, estimatedOneRepMaxKg, tonnageGrams } from './metrics'

export interface WeekPoint { weekStart: Day; tonnageGrams: number; workingSets: number; workouts: number }
export interface E1rmPoint { date: Day; e1rmKg: number; weightGrams: number; reps: number }
export interface MuscleContribution { exercise: string; direct: number; indirect: number }
export interface MuscleVolume { muscle: MuscleId; direct: number; indirect: number; contributions: MuscleContribution[]; effective: number }
export interface ExerciseStat {
  name: string; primary: MuscleId; tonnageGrams: number; workingSets: number; days: number
  maxWeightGrams: number; bestE1rmKg: number | null; lastDate: Day; lastChangePct: number | null
}
export interface ExerciseDay { date: Day; tonnageGrams: number; workingSets: number; maxWeightGrams: number; bestE1rmKg: number | null; sets: LoggedSet[] }

const working = (s: LoggedSet) => (s.kind ?? WORKING) === WORKING && s.reps > 0
const e1 = (s: LoggedSet) => estimatedOneRepMaxKg(s.weightGrams / 1000, s.reps)
const groupBy = <T, K>(items: T[], f: (t: T) => K) => {
  const m = new Map<K, T[]>()
  for (const i of items) { const k = f(i); const arr = m.get(k); if (arr) arr.push(i); else m.set(k, [i]) }
  return m
}

export function weekly(sets: LoggedSet[], sessionStarts: number[], weeks: number, today: Day, dayOf: DayOf): WeekPoint[] {
  const current = weekStart(today)
  const setsByWeek = groupBy(sets, s => weekStart(dayOf(s.createdAt ?? 0)))
  const sessionsByWeek = groupBy(sessionStarts, t => weekStart(dayOf(t)))
  const out: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const w = current - 7 * i
    const own = setsByWeek.get(w) ?? []
    out.push({ weekStart: w, tonnageGrams: tonnageGrams(own), workingSets: completedWorkingSets(own), workouts: sessionsByWeek.get(w)?.length ?? 0 })
  }
  return out
}

export function e1rmHistory(sets: LoggedSet[], exercise: string, dayOf: DayOf): E1rmPoint[] {
  const k = canonicalKey(exercise)
  const eligible = sets.filter(s => working(s) && s.reps <= MAX_E1RM_REPS && canonicalKey(s.exercise ?? '') === k)
  return [...groupBy(eligible, s => dayOf(s.createdAt ?? 0)).entries()].map(([day, list]) => {
    const best = list.reduce((a, b) => (e1(b) > e1(a) ? b : a))
    return { date: day, e1rmKg: e1(best), weightGrams: best.weightGrams, reps: best.reps }
  }).sort((a, b) => a.date - b.date)
}

export function muscleVolume(sets: LoggedSet[], resolve: (n: string) => CatalogExercise, from: Day, to: Day, dayOf: DayOf): MuscleVolume[] {
  const acc = new Map<MuscleId, Map<string, [number, number]>>()
  const bump = (m: MuscleId, name: string, idx: 0 | 1) => {
    let byEx = acc.get(m); if (!byEx) { byEx = new Map(); acc.set(m, byEx) }
    const c = byEx.get(name) ?? [0, 0]; c[idx]++; byEx.set(name, c)
  }
  for (const s of sets) {
    if (!working(s)) continue
    const d = dayOf(s.createdAt ?? 0)
    if (d < from || d > to) continue
    const ex = resolve(s.exercise ?? '')
    bump(ex.primary, ex.name, 0)
    for (const m of ex.secondary) bump(m, ex.name, 1)
  }
  return [...acc.entries()].map(([muscle, byEx]) => {
    const contributions = [...byEx.entries()].map(([exercise, [direct, indirect]]) => ({ exercise, direct, indirect }))
      .sort((a, b) => (b.direct + b.indirect * 0.5) - (a.direct + a.indirect * 0.5))
    const direct = contributions.reduce((t, c) => t + c.direct, 0)
    const indirect = contributions.reduce((t, c) => t + c.indirect, 0)
    return { muscle, direct, indirect, contributions, effective: direct + indirect * 0.5 }
  }).sort((a, b) => b.effective - a.effective || muscleIndex(a.muscle) - muscleIndex(b.muscle))
}

export function exerciseStats(sets: LoggedSet[], resolve: (n: string) => CatalogExercise, from: Day, to: Day, dayOf: DayOf): ExerciseStat[] {
  const inRange = sets.filter(s => working(s)).filter(s => { const d = dayOf(s.createdAt ?? 0); return d >= from && d <= to })
  return [...groupBy(inRange, s => canonicalKey(s.exercise ?? '')).values()].map(group => {
    const name = canonical(group[0].exercise ?? '')
    const byDay = [...groupBy(group, s => dayOf(s.createdAt ?? 0)).entries()].sort((a, b) => a[0] - b[0])
    const dayTonnage = byDay.map(([, l]) => tonnageGrams(l))
    const e1s = group.filter(s => s.reps <= MAX_E1RM_REPS).map(e1)
    const prev = dayTonnage.length >= 2 ? dayTonnage[dayTonnage.length - 2] : 0
    return {
      name,
      primary: resolve(name).primary,
      tonnageGrams: tonnageGrams(group),
      workingSets: group.length,
      days: byDay.length,
      maxWeightGrams: Math.max(...group.map(s => s.weightGrams)),
      bestE1rmKg: e1s.length ? Math.max(...e1s) : null,
      lastDate: byDay[byDay.length - 1][0],
      lastChangePct: dayTonnage.length >= 2 && prev > 0 ? Math.trunc((dayTonnage[dayTonnage.length - 1] - prev) * 100 / prev) : null
    }
  }).sort((a, b) => b.tonnageGrams - a.tonnageGrams)
}

export function exerciseDays(sets: LoggedSet[], exercise: string, dayOf: DayOf): ExerciseDay[] {
  const k = canonicalKey(exercise)
  const own = sets.filter(s => canonicalKey(s.exercise ?? '') === k)
  return [...groupBy(own, s => dayOf(s.createdAt ?? 0)).entries()].sort((a, b) => a[0] - b[0]).map(([date, daySets]) => {
    const w = daySets.filter(working)
    const e1s = w.filter(s => s.reps <= MAX_E1RM_REPS).map(e1)
    return {
      date,
      tonnageGrams: tonnageGrams(w),
      workingSets: w.length,
      maxWeightGrams: w.length ? Math.max(...w.map(s => s.weightGrams)) : 0,
      bestE1rmKg: e1s.length ? Math.max(...e1s) : null,
      sets: [...daySets].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    }
  })
}

export function weekStreak(sessionStarts: number[], today: Day, dayOf: DayOf): number {
  const weeks = new Set(sessionStarts.map(t => weekStart(dayOf(t))))
  let cursor = weekStart(today)
  if (!weeks.has(cursor)) cursor -= 7
  let streak = 0
  while (weeks.has(cursor)) { streak++; cursor -= 7 }
  return streak
}

export interface Adherence { planned: number; done: number; percent: number }

/** plannedDays: ISO weekdays 1..7; workoutDates: days with a workout. */
export function adherence(plannedDays: Set<number>, workoutDates: Set<Day>, from: Day, to: Day, today: Day, isoDowOf: (d: Day) => number): Adherence {
  let planned = 0, done = 0
  for (let d = from; d <= Math.min(to, today); d++) {
    if (plannedDays.has(isoDowOf(d))) { planned++; if (workoutDates.has(d)) done++ }
  }
  return { planned, done, percent: planned === 0 ? 0 : Math.trunc(done * 100 / planned) }
}

export { OTHER }
