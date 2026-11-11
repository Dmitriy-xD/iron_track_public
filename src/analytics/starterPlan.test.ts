import { describe, expect, it } from 'vitest'
import { find } from './catalog'
import { ALL_TEMPLATE_EXERCISES, Answers, buildStarterPlan, recommend } from './starterPlan'

const base: Answers = { sex: 'm', aim: 'mass', days: 3, split: 'auto', level: 1, minutes: 60 }

describe('starter plan', () => {
  it('uses only catalog exercises', () => {
    expect(ALL_TEMPLATE_EXERCISES.filter(n => !find(n))).toEqual([])
  })
  it('every combination gives the asked number of days, no duplicates inside a day', () => {
    for (const sex of ['m', 'f'] as const) for (const days of [2, 3, 4, 5] as const)
      for (const split of ['auto', 'fullbody', 'upperlower', 'ppl', 'split'] as const) for (const level of [0, 1, 3] as const) {
        const p = buildStarterPlan({ ...base, sex, days, split, level })
        expect(p.length).toBe(days)
        expect(new Set(p.map(d => d.dayOfWeek)).size).toBe(days)
        for (const d of p) {
          expect(new Set(d.exercises).size).toBe(d.exercises.length)
          expect(d.exercises.length).toBeGreaterThanOrEqual(4)
          expect(d.goals.length).toBe(d.exercises.length)
        }
      }
  })
  it('recommends full body to beginners and a split to 5-day lifters', () => {
    expect(recommend(3, 0, 'm')).toBe('fullbody')
    expect(recommend(4, 1, 'm')).toBe('upperlower')
    expect(recommend(5, 3, 'f')).toBe('split')
  })
  it('strength aim makes the first compounds strength work; beginners get machines', () => {
    const s = buildStarterPlan({ ...base, aim: 'strength', split: 'ppl' })
    expect(s[0].goals.slice(0, 3)).toEqual(['strength', 'strength', 'hypertrophy'])
    const b = buildStarterPlan({ ...base, level: 0, split: 'fullbody' })
    expect(b[0].exercises[0]).toBe('Жим ногами')
    expect(b.every(d => d.goals.every(g => g === 'hypertrophy'))).toBe(true)
  })
})
