// Same cases as ForecastTest.kt.
import { describe, expect, it } from 'vitest'
import { find } from './catalog'
import { compare, predict } from './forecast'
import { ExerciseDay } from './insights'
import { LoggedSet } from './metrics'

const bench = find('Жим штанги лёжа')!
const set = (weightGrams: number, reps: number, rir: number): LoggedSet => ({ weightGrams, reps, rir, kind: 'working' })
const lastDay = (...sets: LoggedSet[]): ExerciseDay => ({ date: 0, tonnageGrams: 0, workingSets: sets.length, maxWeightGrams: Math.max(...sets.map(s => s.weightGrams)), bestE1rmKg: null, sets })

describe('forecast', () => {
  it('first set from the last workout', () => {
    const f = predict(bench, 'hypertrophy', 60_000, [], lastDay(set(60_000, 8, 2)), null)!
    expect(f.reps).toBe(9); expect(f.rir).toBe(1); expect(f.basis).toBe('по прошлой тренировке'); expect(f.note ?? null).toBeNull()
  })
  it('next set counts fatigue', () => {
    const f = predict(bench, 'hypertrophy', 60_000, [set(60_000, 9, 1)], null, null)!
    expect(f.reps).toBe(8); expect(f.basis).toBe('по прошлому подходу')
  })
  it('strength: too heavy suggests lighter', () => {
    const f = predict(bench, 'strength', 70_000, [], lastDay(set(60_000, 8, 2)), null)!
    expect(f.reps).toBe(2); expect(f.suggestedWeightGrams).toBe(62_500); expect(f.note).toBeTruthy()
  })
  it('from the record when there is no history', () => {
    expect(predict(bench, 'strength', 57_500, [], null, 73.5)!.reps).toBe(6)
    expect(predict(bench, 'strength', 57_500, [], null, null)).toBeNull()
  })
  it('compare counts the reserve', () => {
    const f = { weightGrams: 60_000, reps: 9, rir: 1, basis: '' }
    expect(compare(f, 8, 2, bench, 'hypertrophy').verdict).toBe('ON_TARGET')
    const above = compare(f, 12, 1, bench, 'hypertrophy')
    expect(above.verdict).toBe('ABOVE'); expect(above.advice).toContain('+2.5 кг')
    expect(compare(f, 6, 0, bench, 'hypertrophy').verdict).toBe('BELOW')
  })
})
