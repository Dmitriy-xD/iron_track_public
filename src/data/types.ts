import { TrainingGoal, parseGoal } from '../analytics/goal'

// Server rows (see server/api/_lib/tables.php) in camelCase.
export interface Session { id: string; startedAt: number; finishedAt: number | null; title: string | null; updatedAt: number }
export interface WSet {
  id: string; sessionId: string; exercise: string; weightGrams: number; reps: number; rir: number | null
  kind: string; createdAt: number; implements: number; updatedAt: number; goal: string | null; targetReps?: number | null
}
export interface Measurement {
  id: string; epochDay: number; weightGrams: number | null; bodyFatPct: number | null
  waistCm: number | null; chestCm: number | null; armCm: number | null; updatedAt: number
}
export interface PlanDayRow { dayOfWeek: number; title: string; exercises: string; goals: string; updatedAt: number }
export interface CustomRow { name: string; muscle: string; title: string; secondary: string; updatedAt: number; admin?: boolean }
export interface Profile {
  name: string; birthYear: number | null; heightCm: number | null; sex: string | null
  experienceYears: number | null; goal: string; notes: string; updatedAt: number
}
export const emptyProfile: Profile = { name: '', birthYear: null, heightCm: null, sex: null, experienceYears: null, goal: '', notes: '', updatedAt: 0 }

export const planExercises = (p: PlanDayRow) => p.exercises.split('\n').map(s => s.trim()).filter(Boolean)
/** Goal of each plan exercise, aligned with [planExercises] (port of PlanDayEntity.goalList()). */
export const planGoals = (p: PlanDayRow): TrainingGoal[] => {
  const names = p.exercises.split('\n'), g = (p.goals ?? '').split('\n')
  return names.flatMap((n, i) => (n.trim() ? [parseGoal(g[i]?.trim())] : []))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const fromRow = {
  session: (r: any): Session => ({ id: r.id, startedAt: Number(r.started_at), finishedAt: r.finished_at == null ? null : Number(r.finished_at), title: r.title, updatedAt: Number(r.updated_at) }),
  set: (r: any): WSet => ({
    id: r.id, sessionId: r.session_id, exercise: r.exercise, weightGrams: Number(r.weight_grams), reps: r.reps, rir: r.rir,
    kind: r.kind, createdAt: Number(r.created_at), implements: r.implements ?? 1, updatedAt: Number(r.updated_at), goal: r.goal ?? null, targetReps: r.target_reps ?? null
  }),
  measurement: (r: any): Measurement => ({
    id: r.id, epochDay: Number(r.epoch_day), weightGrams: r.weight_grams == null ? null : Number(r.weight_grams),
    bodyFatPct: r.body_fat_pct, waistCm: r.waist_cm, chestCm: r.chest_cm, armCm: r.arm_cm, updatedAt: Number(r.updated_at)
  }),
  plan: (r: any): PlanDayRow => ({ dayOfWeek: r.day_of_week, title: r.title, exercises: r.exercises, goals: r.goals ?? '', updatedAt: Number(r.updated_at) }),
  custom: (r: any): CustomRow => ({ name: r.name, muscle: r.muscle, title: r.title ?? '', secondary: r.secondary ?? '', updatedAt: Number(r.updated_at), admin: !!r.admin }),
  profile: (r: any): Profile => ({
    name: r.name ?? '', birthYear: r.birth_year, heightCm: r.height_cm, sex: r.sex, experienceYears: r.experience_years,
    goal: r.goal ?? '', notes: r.notes ?? '', updatedAt: Number(r.updated_at)
  })
}

export const toRow = {
  session: (s: Session) => ({ id: s.id, started_at: s.startedAt, finished_at: s.finishedAt, title: s.title, updated_at: s.updatedAt, deleted: false }),
  set: (s: WSet) => ({
    id: s.id, session_id: s.sessionId, exercise: s.exercise, weight_grams: s.weightGrams, reps: s.reps, rir: s.rir,
    kind: s.kind, created_at: s.createdAt, implements: s.implements, goal: s.goal, target_reps: s.targetReps ?? null, updated_at: s.updatedAt, deleted: false
  }),
  measurement: (m: Measurement) => ({
    id: m.id, epoch_day: m.epochDay, weight_grams: m.weightGrams, body_fat_pct: m.bodyFatPct, waist_cm: m.waistCm,
    chest_cm: m.chestCm, arm_cm: m.armCm, updated_at: m.updatedAt, deleted: false
  }),
  plan: (p: PlanDayRow, userId: string) => ({ user_id: userId, day_of_week: p.dayOfWeek, title: p.title, exercises: p.exercises, goals: p.goals, updated_at: p.updatedAt, deleted: false }),
  custom: (c: CustomRow, userId: string) => ({ user_id: userId, name: c.name, muscle: c.muscle, title: c.title, secondary: c.secondary, updated_at: c.updatedAt, deleted: false }),
  profile: (p: Profile, userId: string) => ({
    user_id: userId, name: p.name, birth_year: p.birthYear, height_cm: p.heightCm, sex: p.sex,
    experience_years: p.experienceYears, goal: p.goal, notes: p.notes, updated_at: p.updatedAt, deleted: false
  })
}
