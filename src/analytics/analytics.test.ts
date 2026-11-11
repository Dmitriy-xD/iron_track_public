// Same scenarios as the Kotlin tests (UserDumpScenarioTest, WeeklyReviewTest, TrainingMetricsTest),
// so the web app and the Android app give identical numbers.
import { describe, expect, it } from 'vitest'
import { canonical, find, resolve, isKnown } from './catalog'
import { dayInOffset, fromYmd, isoDow, plural } from './dates'
import { exerciseDays, exerciseStats, muscleVolume, weekStreak } from './insights'
import { LoggedSet, estimatedOneRepMaxKg, exerciseRecords, formatKg, parseKgToGrams, tonnageGrams } from './metrics'
import { suggest, suggestFor } from './progression'
import { parseGoal, restSeconds, strengthReps, strengthWeightFromE1rm, warmup } from './goal'
import { buildCoaching } from './coaching'
import { buildWeeklyReview } from './weeklyReview'
import { buildReport } from './report'

const msk = dayInOffset(180)
const r = (n: string) => resolve(n, {})
const dump: LoggedSet[] = [
  { weightGrams: 110000, reps: 11, exercise: 'Жим ногами', createdAt: 1792006648835, rir: 1 },
  { weightGrams: 110000, reps: 10, exercise: 'Жим ногами', createdAt: 1792006652834, rir: 1 },
  { weightGrams: 110000, reps: 10, exercise: 'Жим ногами', createdAt: 1792006654032, rir: 1 },
  { weightGrams: 110000, reps: 9, exercise: 'Жим ногами', createdAt: 1792006659931, rir: 0 },
  { weightGrams: 23000, reps: 10, exercise: 'Тяга верхнего блока', createdAt: 1792006722749, rir: 1 },
  { weightGrams: 23000, reps: 10, exercise: 'Тяга верхнего блока', createdAt: 1792006724357, rir: 1 },
  { weightGrams: 23000, reps: 10, exercise: 'Тяга верхнего блока', createdAt: 1792006725587, rir: 1 },
  { weightGrams: 23000, reps: 7, exercise: 'Тяга верхнего блока', createdAt: 1792006740653, rir: 0 }
]
const day = msk(1792006648835)

describe('metrics', () => {
  it('tonnage, warmups, dumbbells', () => {
    expect(tonnageGrams(Array(4).fill({ weightGrams: 55000, reps: 9 }))).toBe(1980000)
    expect(tonnageGrams([{ weightGrams: 20000, reps: 10, kind: 'warmup' }])).toBe(0)
    expect(tonnageGrams([{ weightGrams: 20000, reps: 10, implements: 2 }])).toBe(400000)
  })
  it('e1RM and records merge aliases', () => {
    expect(estimatedOneRepMaxKg(55, 9)).toBeCloseTo(71.5)
    expect(() => estimatedOneRepMaxKg(55, 20)).toThrow()
    const recs = exerciseRecords([
      { weightGrams: 55000, reps: 9, exercise: 'Жим лёжа' }, { weightGrams: 60000, reps: 6, exercise: 'жим лёжа ' },
      { weightGrams: 100000, reps: 5, exercise: 'Присед' }
    ])
    expect(recs.map(x => x.exercise)).toEqual(['Жим штанги лёжа', 'Присед'])
    expect(recs[0].bestE1rmKg).toBeCloseTo(72)
  })
  it('kg formatting and parsing', () => {
    expect(formatKg(55500)).toBe('55.5'); expect(formatKg(1980000)).toBe('1980'); expect(formatKg(0)).toBe('0'); expect(formatKg(100)).toBe('0.1')
    expect(parseKgToGrams('52,5')).toBe(52500); expect(parseKgToGrams(' 52.5 ')).toBe(52500)
    for (const bad of ['', 'abc', '-5', '1000.5', '1.2345']) expect(parseKgToGrams(bad)).toBeNull()
  })
})

describe('catalog', () => {
  it('aliases and user exercises', () => {
    expect(canonical('Тяга верхнего хамера')).toBe('Тяга хаммера сверху')
    expect(canonical('жим штанги лежа')).toBe('Жим штанги лёжа')
    expect(r('Разведения').primary).toBe('GLUTES')
    expect(r('Сведения').primary).toBe('ADDUCTORS')
    expect(r('Сгибания с блинами').primary).toBe('FOREARMS')
    expect(isKnown(r('Непонятное'))).toBe(false)
    expect(resolve('Мой жим ', { 'мой жим': { name: 'Мой жим', primary: 'CHEST', secondary: ['TRICEPS'] } }).secondary).toEqual(['TRICEPS'])
  })
})

describe('user dump scenario', () => {
  it('biceps only indirect from pulldown', () => {
    const v = Object.fromEntries(muscleVolume(dump, r, day, day, msk).map(x => [x.muscle, x]))
    expect(v.QUADS.direct).toBe(4); expect(v.BACK.direct).toBe(4)
    expect(v.BICEPS.direct).toBe(0); expect(v.BICEPS.indirect).toBe(4); expect(v.BICEPS.effective).toBe(2)
  })
  it('tonnage per exercise', () => {
    const s = exerciseStats(dump, r, day, day, msk)
    expect(s.map(x => x.name)).toEqual(['Жим ногами', 'Тяга верхнего блока'])
    expect(s[0].tonnageGrams).toBe(4400000); expect(s[1].tonnageGrams).toBe(851000)
  })
  it('progression hints', () => {
    const lp = suggest(find('Жим ногами')!, exerciseDays(dump, 'Жим ногами', msk).at(-1))
    expect(lp.kind).toBe('BUILD_REPS'); expect(lp.targetWeightGrams).toBe(110000); expect(lp.targetReps).toBe(10)
    const bench = find('Жим штанги лёжа')!
    const dayOf = (reps: number[], rir = 2) => ({ date: 0, tonnageGrams: 0, workingSets: reps.length, maxWeightGrams: 60000, bestE1rmKg: null, sets: reps.map(x => ({ weightGrams: 60000, reps: x, rir })) })
    expect(suggest(bench, dayOf([10, 10, 10])).targetWeightGrams).toBe(62500)
    expect(suggest(bench, dayOf([4, 4, 3])).targetWeightGrams).toBe(52500)
    expect(suggest(bench, dayOf([8, 8, 7], 4)).kind).toBe('INCREASE')
  })
})

describe('weekly review', () => {
  const monday = fromYmd(2026, 10, 12)
  const plan = [
    { dayOfWeek: 1, title: 'Грудь', exercises: ['Жим штанги лёжа', 'Французский жим', 'Сгибания с блинами'] },
    { dayOfWeek: 3, title: 'Ноги + спина', exercises: ['Жим ногами', 'Тяга верхнего блока', 'Разведения', 'Сведения'] },
    { dayOfWeek: 5, title: 'Грудь', exercises: ['Жим штанги лёжа'] },
    { dayOfWeek: 7, title: 'Спина + плечи', exercises: ['Подтягивания', 'Махи гантелями в стороны'] }
  ]
  it('finished week', () => {
    const w = buildWeeklyReview({ sets: dump, sessions: [[1792006599357, 1792006759723]], plan, resolve: r, weekStart: monday, today: monday + 7, dayOf: msk })
    expect(isoDow(monday)).toBe(1)
    expect(w.isCurrentWeek).toBe(false)
    expect([w.workouts, w.plannedDays, w.doneDays]).toEqual([1, 4, 1])
    expect(w.missedDays).toEqual([1, 5, 7])
    expect(w.tonnageGrams).toBe(5251000)
    expect(w.failureShare).toBe(25)
    expect(w.improve.some(n => n.text.includes('1 из 4'))).toBe(true)
    expect(w.improve.some(n => n.text.startsWith('Мало подходов') && n.text.includes('грудь'))).toBe(true)
    expect(w.recommendations.some(n => n.text.startsWith('Жим ногами: держи 110 кг'))).toBe(true)
    expect(w.topExercises.map(s => s.name)).toEqual(['Жим ногами', 'Тяга верхнего блока'])
  })
  it('current week is not judged early', () => {
    const w = buildWeeklyReview({ sets: [], sessions: [], plan, resolve: r, weekStart: monday, today: monday + 1, dayOf: msk })
    expect(w.missedDays).toEqual([1]); expect(w.plannedDays).toBe(1)
    expect(w.improve.some(n => n.text.startsWith('Мало подходов'))).toBe(false)
  })
})

describe('misc', () => {
  it('plural, streak, report', () => {
    expect([plural(21, 'a', 'b', 'c'), plural(3, 'a', 'b', 'c'), plural(12, 'a', 'b', 'c')]).toEqual(['a', 'b', 'c'])
    const monday = fromYmd(2026, 10, 12)
    const at = (d: number) => (d * 86400000) + 12 * 3600000 - 180 * 60000
    expect(weekStreak([at(monday), at(monday - 7), at(monday - 21)], monday + 1, msk)).toBe(2)
    const text = buildReport({
      title: 'неделя', from: monday, to: monday + 6, today: monday + 6, dayOf: msk, athleteName: 'Дмитрий',
      sets: [
        { weightGrams: 50000, reps: 10, exercise: 'Жим штанги лёжа', createdAt: at(monday - 7) },
        { weightGrams: 55000, reps: 10, exercise: 'Жим штанги лёжа', createdAt: at(monday) },
        { weightGrams: 55000, reps: 10, exercise: 'Жим штанги лёжа', createdAt: at(monday) }
      ],
      sessions: [[at(monday), at(monday) + 3600000]], bodyweights: [[monday, 75000], [monday + 5, 75500]],
      plannedDays: new Set([1, 5]), resolve: r
    })
    for (const part of ['Атлет: Дмитрий', 'Тренировок: 1', 'Выполнение плана: 1 из 2 (50%)', 'Рабочий тоннаж: 1100 кг', 'Среднее время тренировки: 60 мин', 'рекорд', 'Вес тела: 75.5 кг (+0.5 кг за период)'])
      expect(text).toContain(part)
  })
})

// Mirrors GoalTest / CoachingTest (Kotlin).
describe('goals', () => {
  const bench = find('Жим штанги лёжа')!
  const pronation = find('Пронация на блоке')!
  const lastDay = (weight: number, reps: number[], rir: number | null = 2) =>
    ({ date: 0, tonnageGrams: 0, workingSets: reps.length, maxWeightGrams: weight, bestE1rmKg: null, sets: reps.map(x => ({ weightGrams: weight, reps: x, rir })) })

  it('profiles', () => {
    expect(strengthReps(bench)).toEqual({ first: 3, last: 5 })
    expect(strengthReps(pronation)).toEqual({ first: 4, last: 8 })
    expect(restSeconds(bench, 'strength')).toBe(180)
    expect(restSeconds(bench, 'hypertrophy')).toBe(120)
    expect(restSeconds(find('Разгибания на блоке')!, 'hypertrophy')).toBe(90)
    expect(parseGoal(null)).toBe('hypertrophy')
    expect(parseGoal('combo')).toBe('combo')
    expect(find('Приседания со штангой')!.axial).toBe(true)
    expect(bench.axial).toBe(false)
  })
  it('warm-up ramp', () => {
    expect(warmup(62500, bench, 'strength')).toEqual([{ weightGrams: 25000, reps: 8 }, { weightGrams: 37500, reps: 5 }, { weightGrams: 45000, reps: 3 }, { weightGrams: 52500, reps: 1 }])
    expect(warmup(60000, bench, 'hypertrophy')).toEqual([{ weightGrams: 30000, reps: 8 }, { weightGrams: 45000, reps: 4 }])
    expect(warmup(15000, bench, 'strength')).toEqual([])
  })
  it('strength start from e1RM', () => {
    expect(strengthWeightFromE1rm(73.5, bench)).toBe(57500)
    const hint = suggestFor(bench, lastDay(55000, [10, 10, 9]), 'strength', 73.5)
    expect(hint.kind).toBe('FIRST_TIME')
    expect(hint.targetWeightGrams).toBe(57500)
  })
  it('strength progression', () => {
    expect(suggestFor(bench, lastDay(60000, [5, 5, 5], 3), 'strength').targetWeightGrams).toBe(62500)
    const keep = suggestFor(bench, lastDay(60000, [3, 2, 2], 1), 'strength')
    expect(keep.kind).toBe('BUILD_REPS')
    expect(keep.targetWeightGrams).toBe(60000)
    const reduce = suggestFor(bench, lastDay(60000, [1, 1], 0), 'strength')
    expect(reduce.kind).toBe('REDUCE')
    expect(reduce.targetWeightGrams).toBe(52500)
  })
  it('combo top and back-off', () => {
    const last = { date: 0, tonnageGrams: 0, workingSets: 3, maxWeightGrams: 60000, bestE1rmKg: null,
      sets: [{ weightGrams: 60000, reps: 5, rir: 3 }, { weightGrams: 47500, reps: 10, rir: 1 }, { weightGrams: 47500, reps: 9, rir: 1 }] }
    const hint = suggestFor(bench, last, 'combo')
    expect(hint.goal).toBe('combo')
    expect(hint.targetWeightGrams).toBe(62500)
    expect(hint.backOffWeightGrams).toBe(50000)
  })
})

describe('coaching', () => {
  const utc = dayInOffset(0)
  const end = fromYmd(2026, 10, 18)
  const d = fromYmd(2026, 10, 14)
  const t = (sec: number) => d * 86_400_000 + 18 * 3_600_000 + sec * 1000
  it('short rests and protein are reported', () => {
    const sets: LoggedSet[] = [
      { weightGrams: 60000, reps: 4, exercise: 'Жим штанги лёжа', createdAt: t(0), rir: 2, goal: 'strength', sessionId: 's' },
      { weightGrams: 60000, reps: 4, exercise: 'Жим штанги лёжа', createdAt: t(90), rir: 2, goal: 'strength', sessionId: 's' },
      { weightGrams: 60000, reps: 4, exercise: 'Жим штанги лёжа', createdAt: t(180), rir: 2, goal: 'strength', sessionId: 's' },
      { weightGrams: 20000, reps: 12, exercise: 'Французский жим', createdAt: t(600), rir: 1, sessionId: 's' },
      { weightGrams: 20000, reps: 12, exercise: 'Французский жим', createdAt: t(640), rir: 1, sessionId: 's' },
      { weightGrams: 20000, reps: 11, exercise: 'Французский жим', createdAt: t(680), rir: 0, sessionId: 's' }
    ]
    const pages = buildCoaching({ sets, sessions: [[t(-300), t(3600)]], plan: [], resolve: r, weekEnd: end, dayOf: utc, bodyweightKg: 75 })
    expect(pages.map(p => p.title)).toEqual(['Как тренировать силу', 'Как тренировать массу', 'Восстановление и режим'])
    expect(pages[0].facts.map(f => f.text)).toContain('Отдых перед тяжёлыми подходами ≈ 1.5 мин')
    expect(pages[0].tips.some(x => x.text.startsWith('Отдыхай 3–5 минут'))).toBe(true)
    expect(pages[1].tips.some(x => x.text.startsWith('Отдыхай хотя бы 1.5–2 минуты'))).toBe(true)
    expect(pages[2].tips.map(x => x.text)).toContain('Белок: 120–165 г в день')
  })
  it('suggests combo when there is no heavy work', () => {
    const sets: LoggedSet[] = [
      { weightGrams: 110000, reps: 11, exercise: 'Жим ногами', createdAt: t(0), rir: 1, sessionId: 's' },
      { weightGrams: 23000, reps: 10, exercise: 'Тяга верхнего блока', createdAt: t(200), rir: 1, sessionId: 's' }
    ]
    const pages = buildCoaching({ sets, sessions: [], plan: [], resolve: r, weekEnd: end, dayOf: utc })
    expect(pages[0].title).toBe('Хочешь стать сильнее?')
    expect(pages[0].tips[0].text).toContain('Жим ногами')
  })
  it('strength trend ignores high-rep sets', () => {
    const early = fromYmd(2026, 10, 1) * 86_400_000 + 18 * 3_600_000
    const sets: LoggedSet[] = [
      { weightGrams: 110000, reps: 11, exercise: 'Жим ногами', createdAt: early, rir: 1, sessionId: 'a' },
      { weightGrams: 120000, reps: 3, exercise: 'Жим ногами', createdAt: t(0), rir: 2, goal: 'combo', sessionId: 'b' }
    ]
    const pages = buildCoaching({ sets, sessions: [], plan: [], resolve: r, weekEnd: end, dayOf: utc })
    expect(pages[0].facts.some(f => f.text.includes('1ПМ'))).toBe(false)
  })
  it('no data, no pages', () => {
    expect(buildCoaching({ sets: [], sessions: [], plan: [], resolve: r, weekEnd: end, dayOf: utc })).toEqual([])
  })
})
