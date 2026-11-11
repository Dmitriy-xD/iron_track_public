// First-visit plan: from a few answers (sex, goal, days, split, experience, time) builds a ready weekly plan from catalog
// exercises, so a newcomer never has to set everything up from scratch. The person edits it later in the calendar.
import { TrainingGoal } from './goal'

export type Sex = 'm' | 'f'
export type Aim = 'mass' | 'strength' | 'combo' | 'tone'
export type Split = 'fullbody' | 'upperlower' | 'ppl' | 'split'
export type Level = 0 | 1 | 3 // years of experience: beginner, 6 months – 2 years, 2+ years
export interface Answers { sex: Sex; aim: Aim; days: 2 | 3 | 4 | 5; split: Split | 'auto'; level: Level; minutes: 45 | 60 | 90 }
export interface StarterDay { dayOfWeek: number; title: string; exercises: string[]; goals: TrainingGoal[] }

export const AIMS: { id: Aim; title: string; hint: string; profile: string; art: string }[] = [
  { id: 'mass', title: 'Набрать массу', hint: 'Больше мышц, красивое тело', profile: 'Набрать массу', art: 'muscle' },
  { id: 'strength', title: 'Стать сильнее', hint: 'Больше вес в жиме, приседе, тяге', profile: 'Стать сильнее', art: 'dumbbell' },
  { id: 'combo', title: 'Сила и масса', hint: 'Тяжёлый подход, потом объём', profile: 'Сила и масса', art: 'flame' },
  { id: 'tone', title: 'Похудеть и подтянуться', hint: 'Рельеф и тонус', profile: 'Похудеть и подтянуться', art: 'stopwatch' },
]
export const SPLITS: { id: Split; title: string; hint: string }[] = [
  { id: 'fullbody', title: 'Фулбоди', hint: 'Всё тело за тренировку, 2–3 раза в неделю' },
  { id: 'upperlower', title: 'Верх / низ', hint: 'День верха тела и день ног по очереди' },
  { id: 'ppl', title: 'Тяни-толкай-ноги', hint: 'Жимы · тяги · ноги' },
  { id: 'split', title: 'Сплит по группам', hint: 'Грудь, спина, ноги, плечи — в разные дни' },
]
export const WEEKDAYS: Record<number, number[]> = { 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] }

/** What fits when the person does not know: beginners and 2–3 days → full body, 4 → upper/lower, 5 → split. */
export function recommend(days: number, level: Level, sex: Sex): Split {
  if (days <= 2 || (days === 3 && level === 0)) return 'fullbody'
  if (days === 3) return sex === 'f' ? 'fullbody' : 'ppl'
  if (days === 4) return 'upperlower'
  return 'split'
}

type Day = [string, string[]]
const M: Record<string, Day> = {
  fbA: ['Всё тело A', ['Приседания со штангой', 'Жим штанги лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Подъём штанги на бицепс', 'Разгибания на блоке']],
  fbB: ['Всё тело B', ['Румынская тяга', 'Жим гантелей на наклонной скамье', 'Тяга верхнего блока', 'Махи гантелями в стороны', 'Молотки', 'Скручивания на блоке']],
  up: ['Верх тела', ['Жим штанги лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Тяга верхнего блока', 'Подъём гантелей на бицепс', 'Разгибания на блоке']],
  low: ['Ноги', ['Приседания со штангой', 'Румынская тяга', 'Жим ногами', 'Сгибания ног', 'Подъём на носки', 'Подъём ног в висе']],
  push: ['Жимы: грудь, плечи, трицепс', ['Жим штанги лёжа', 'Жим гантелей на наклонной скамье', 'Жим гантелей сидя', 'Махи гантелями в стороны', 'Разгибания на блоке', 'Французский жим']],
  pull: ['Тяги: спина, бицепс', ['Подтягивания', 'Тяга штанги в наклоне', 'Тяга горизонтального блока', 'Тяга к лицу', 'Подъём штанги на бицепс', 'Молотки']],
  legs: ['Ноги', ['Приседания со штангой', 'Румынская тяга', 'Жим ногами', 'Сгибания ног', 'Подъём на носки', 'Скручивания на блоке']],
  chestTri: ['Грудь и трицепс', ['Жим штанги лёжа', 'Жим гантелей на наклонной скамье', 'Сведения в кроссовере', 'Отжимания на брусьях', 'Разгибания на блоке', 'Французский жим']],
  backBi: ['Спина и бицепс', ['Подтягивания', 'Тяга штанги в наклоне', 'Тяга горизонтального блока', 'Тяга верхнего блока', 'Подъём штанги на бицепс', 'Молотки']],
  legsSh: ['Ноги и плечи', ['Приседания со штангой', 'Жим ногами', 'Румынская тяга', 'Жим гантелей сидя', 'Махи гантелями в стороны', 'Махи в наклоне']],
  chest: ['Грудь', ['Жим штанги лёжа', 'Жим гантелей на наклонной скамье', 'Отжимания на брусьях', 'Сведения в кроссовере', 'Разводка гантелей лёжа', 'Скручивания на блоке']],
  back: ['Спина', ['Подтягивания', 'Тяга штанги в наклоне', 'Тяга горизонтального блока', 'Тяга верхнего блока', 'Шраги', 'Гиперэкстензия']],
  shoulders: ['Плечи', ['Жим штанги стоя', 'Жим гантелей сидя', 'Махи гантелями в стороны', 'Махи в наклоне', 'Тяга к лицу', 'Подъём ног в висе']],
  arms: ['Руки', ['Подъём штанги на бицепс', 'Жим узким хватом', 'Молотки', 'Французский жим', 'Сгибания на скамье Скотта', 'Разгибания на блоке']],
  shArms: ['Плечи и руки', ['Жим гантелей сидя', 'Махи гантелями в стороны', 'Подъём штанги на бицепс', 'Французский жим', 'Молотки', 'Разгибания на блоке']],
}
const F: Record<string, Day> = {
  fbA: ['Всё тело A', ['Приседания со штангой', 'Ягодичный мост', 'Тяга верхнего блока', 'Жим гантелей сидя', 'Разгибания ног', 'Скручивания на блоке']],
  fbB: ['Всё тело B', ['Румынская тяга', 'Выпады с гантелями', 'Тяга горизонтального блока', 'Жим гантелей на наклонной скамье', 'Сгибания ног', 'Разведение ног в тренажёре']],
  up: ['Верх тела', ['Тяга верхнего блока', 'Жим гантелей на наклонной скамье', 'Тяга горизонтального блока', 'Махи гантелями в стороны', 'Разгибания на блоке', 'Подъём гантелей на бицепс']],
  low: ['Ноги и ягодицы', ['Ягодичный мост', 'Румынская тяга', 'Болгарские сплит-приседания', 'Сгибания ног', 'Разведение ног в тренажёре', 'Подъём ног в висе']],
  push: ['Верх: жимы', ['Жим гантелей на наклонной скамье', 'Жим гантелей сидя', 'Махи гантелями в стороны', 'Сведения в кроссовере', 'Разгибания на блоке', 'Скручивания на блоке']],
  pull: ['Верх: тяги', ['Тяга верхнего блока', 'Тяга горизонтального блока', 'Тяга гантели в наклоне с опорой', 'Тяга к лицу', 'Подъём гантелей на бицепс', 'Гиперэкстензия']],
  legs: ['Ноги и ягодицы', ['Приседания со штангой', 'Ягодичный мост', 'Румынская тяга', 'Выпады с гантелями', 'Разведение ног в тренажёре', 'Подъём на носки']],
  glutes: ['Ягодицы', ['Ягодичный мост', 'Румынская тяга', 'Болгарские сплит-приседания', 'Разведение ног в тренажёре', 'Гиперэкстензия', 'Сгибания ног']],
  quads: ['Ноги', ['Приседания со штангой', 'Жим ногами', 'Выпады с гантелями', 'Разгибания ног', 'Сведение ног в тренажёре', 'Подъём на носки']],
  shArms: ['Плечи и руки', ['Жим гантелей сидя', 'Махи гантелями в стороны', 'Махи в наклоне', 'Подъём гантелей на бицепс', 'Разгибания на блоке', 'Скручивания на блоке']],
}
// Beginners start on machines: easier technique, same muscles.
const EASY: Record<string, string> = {
  'Приседания со штангой': 'Жим ногами', 'Жим штанги лёжа': 'Жим в тренажёре на грудь', 'Тяга штанги в наклоне': 'Тяга горизонтального блока',
  'Подтягивания': 'Тяга верхнего блока', 'Жим штанги стоя': 'Жим в тренажёре на плечи', 'Отжимания на брусьях': 'Жим в тренажёре на грудь',
  'Румынская тяга': 'Гиперэкстензия', 'Болгарские сплит-приседания': 'Выпады с гантелями',
}

function schedule(split: Split, days: number, sex: Sex): string[] {
  const cycle = (a: string[]) => Array.from({ length: days }, (_, i) => a[i % a.length])
  if (split === 'fullbody' || days === 2 && split === 'ppl') return cycle(['fbA', 'fbB'])
  if (split === 'upperlower') return cycle(sex === 'f' ? ['low', 'up'] : ['up', 'low'])
  if (split === 'ppl') return cycle(sex === 'f' ? ['legs', 'pull', 'push'] : ['push', 'pull', 'legs'])
  if (sex === 'f') return { 2: ['low', 'up'], 3: ['glutes', 'up', 'quads'], 4: ['glutes', 'up', 'quads', 'shArms'], 5: ['glutes', 'pull', 'quads', 'push', 'shArms'] }[days]!
  return { 2: ['up', 'low'], 3: ['chestTri', 'backBi', 'legsSh'], 4: ['chestTri', 'backBi', 'legs', 'shArms'], 5: ['chest', 'back', 'legs', 'shoulders', 'arms'] }[days]!
}

export function buildStarterPlan(a: Answers): StarterDay[] {
  const split = a.split === 'auto' ? recommend(a.days, a.level, a.sex) : a.split
  const lib = a.sex === 'f' ? F : M
  const count = Math.min(a.minutes === 45 ? 4 : a.minutes === 60 ? 5 : 6, a.level === 0 ? 5 : 6)
  return schedule(split, a.days, a.sex).map((id, i) => {
    const [title, all] = lib[id] ?? M[id]
    const names = [...new Set(all.map(n => (a.level === 0 ? EASY[n] ?? n : n)))].slice(0, count)
    const goals: TrainingGoal[] = names.map((_, j) =>
      a.aim === 'strength' && j < 2 && a.level > 0 ? 'strength' : a.aim === 'combo' && j === 0 && a.level > 0 ? 'combo' : 'hypertrophy')
    return { dayOfWeek: WEEKDAYS[a.days][i], title, exercises: names, goals }
  })
}

export const ALL_TEMPLATE_EXERCISES = [...new Set([...Object.values(M), ...Object.values(F)].flatMap(d => d[1]).concat(Object.values(EASY)))]
