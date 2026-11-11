// Port of ExerciseCatalog.kt. Data comes from shared/exercise-catalog.json, generated from the Kotlin catalog.
import data from '../../../shared/exercise-catalog.json'

export type MuscleId = string

export interface CatalogExercise {
  name: string
  primary: MuscleId
  secondary: MuscleId[]
  pair: boolean
  aliases: string[]
  repsMin: number
  repsMax: number
  stepGrams: number
  custom?: boolean
  axial?: boolean
}

export interface CustomExercise {
  name: string
  primary: MuscleId
  secondary: MuscleId[]
}

export const MUSCLES: { id: MuscleId; title: string }[] = data.muscles
export const OTHER: MuscleId = 'OTHER'
export const SELECTABLE_MUSCLES = MUSCLES.filter(m => m.id !== OTHER)
const muscleOrder = new Map(MUSCLES.map((m, i) => [m.id, i]))
export const muscleTitle = (id: MuscleId) => MUSCLES.find(m => m.id === id)?.title ?? id
export const muscleIndex = (id: MuscleId) => muscleOrder.get(id) ?? 999

export function parseMuscle(value: string | null | undefined): MuscleId {
  if (value === 'LEGS') return 'QUADS'
  return MUSCLES.some(m => m.id === value) ? (value as string) : OTHER
}

export const CATALOG: CatalogExercise[] = data.exercises

export const key = (name: string) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

const byName = new Map<string, CatalogExercise>()
for (const e of CATALOG) {
  byName.set(key(e.name), e)
  for (const a of e.aliases) byName.set(key(a), e)
}

export const find = (name: string) => byName.get(key(name))
export const canonical = (name: string) => find(name)?.name ?? name.trim()
export const canonicalKey = (name: string) => key(canonical(name))
export const isKnown = (e: CatalogExercise) => e.primary !== OTHER

export function resolve(name: string, custom: Record<string, CustomExercise>): CatalogExercise {
  const c = find(name)
  if (c) return c
  const u = custom[key(name)]
  if (u) return { name: u.name, primary: u.primary, secondary: u.secondary, pair: false, aliases: [], repsMin: 8, repsMax: 12, stepGrams: 2500, custom: true }
  return { name: name.trim(), primary: OTHER, secondary: [], pair: false, aliases: [], repsMin: 8, repsMax: 12, stepGrams: 2500, custom: true }
}
