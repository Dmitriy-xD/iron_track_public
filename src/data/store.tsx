import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../access'
import { Row, User, editSessionTimes as apiEditSessionTimes, markDeleted, pullAll, push } from './api'
import { CustomRow, Measurement, PlanDayRow, Profile, Session, WSet, emptyProfile, fromRow, planExercises, toRow } from './types'
import { CatalogExercise, CustomExercise, find, key as exKey, parseMuscle, resolve as resolveExercise } from '../analytics/catalog'
import { LoggedSet } from '../analytics/metrics'

export interface Notebook { id: string; name: string }

export interface Db {
  sessions: Session[]
  sets: WSet[]
  measurements: Measurement[]
  plan: PlanDayRow[]
  customRows: CustomRow[]
  profile: Profile
}

const emptyDb: Db = { sessions: [], sets: [], measurements: [], plan: [], customRows: [], profile: emptyProfile }

export interface Store {
  db: Db
  loading: boolean
  error: string | null
  userId: string
  email: string
  user: User
  setUser: (u: User) => void
  /** Trainer works in this client's notebook (all data below is the client's), or null. */
  acting: Notebook | null
  openNotebook: (n: Notebook | null) => void
  custom: Record<string, CustomExercise>
  logged: LoggedSet[]
  active: Session | null
  resolve: (name: string) => CatalogExercise
  reload: () => Promise<void>
  startSession: (title: string | null) => Promise<void>
  finishSession: (endAt?: number) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  editSessionTimes: (id: string, startedAt: number, finishedAt: number | null) => Promise<void>
  addSet: (s: Omit<WSet, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>) => Promise<void>
  updateSet: (s: WSet) => Promise<void>
  deleteSet: (id: string) => Promise<void>
  saveProfile: (p: Profile) => Promise<void>
  saveMeasurement: (m: Omit<Measurement, 'updatedAt'>) => Promise<void>
  deleteMeasurement: (id: string) => Promise<void>
  savePlanDay: (p: Omit<PlanDayRow, 'updatedAt'>) => Promise<void>
  deletePlanDay: (day: number) => Promise<void>
  saveCustom: (name: string, primary: string, secondary: string[]) => Promise<void>
  importBackup: (json: string) => Promise<string>
  exportBackup: () => string
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('Store not ready')
  return s
}

async function loadAll<T>(table: string, map: (r: Row) => T): Promise<T[]> {
  return (await pullAll(table)).map(map)
}

/** An unfinished workout with no new set for this long is treated as forgotten. */
export const STALE_MS = 3 * 3_600_000

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export function StoreProvider({ user, setUser, acting, openNotebook, onError, children }: {
  user: User; setUser: (u: User) => void; acting: Notebook | null; openNotebook: (n: Notebook | null) => void
  onError: (m: string) => void; children: ReactNode
}) {
  const userId = user.id
  const email = user.email
  const [db, setDb] = useState<Db>(emptyDb)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dbRef = useRef(db)
  dbRef.current = db

  const reload = useCallback(async () => {
    try {
      const [sessions, sets, measurements, plan, customRows, profiles] = await Promise.all([
        loadAll('sessions', fromRow.session), loadAll('sets', fromRow.set), loadAll('measurements', fromRow.measurement),
        loadAll('plan_days', fromRow.plan), loadAll('custom_exercises', fromRow.custom), loadAll('profiles', fromRow.profile)
      ])
      // A workout nobody touched for hours was forgotten (e.g. started on the phone days ago): close it at the
      // last set + 5 min, or drop it if it is empty — the app must never open with a stale "workout in progress".
      const t = Date.now()
      const fixed: Session[] = [], dropped = new Set<string>()
      for (const x of sessions) {
        if (x.finishedAt != null) continue
        const own = sets.filter(y => y.sessionId === x.id).map(y => y.createdAt)
        if (t - Math.max(x.startedAt, ...own) < STALE_MS) continue
        if (own.length) { x.finishedAt = Math.max(...own) + 5 * 60_000; x.updatedAt = t; fixed.push(x) } else dropped.add(x.id)
      }
      if (fixed.length) push('sessions', fixed.map(toRow.session)).catch(() => undefined)
      if (dropped.size) markDeleted('sessions', [...dropped], t).catch(() => undefined)
      setDb({
        sessions: sessions.filter(x => !dropped.has(x.id)).sort((a, b) => b.startedAt - a.startedAt),
        sets: sets.sort((a, b) => a.createdAt - b.createdAt),
        measurements: measurements.sort((a, b) => a.epochDay - b.epochDay),
        plan: plan.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
        customRows,
        profile: profiles[0] ?? emptyProfile
      })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    // Pick up changes made on the phone: on focus and every minute.
    const onFocus = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const timer = setInterval(reload, 60_000)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); clearInterval(timer) }
  }, [reload])

  /** Optimistic local update + server write; on failure the data is reloaded and the error shown. */
  const write = useCallback(async (local: (d: Db) => Db, remote: () => Promise<unknown>) => {
    setDb(d => local(d))
    try { await remote() } catch (e) { onError('Не сохранилось: ' + (e as Error).message); reload() }
  }, [onError, reload])

  const custom = useMemo(() => {
    const out: Record<string, CustomExercise> = {}
    // Keyed by the normalised name (case, ё, spaces), so rows written by older versions, backups or the admin
    // are still found — otherwise a chosen exercise looked "unknown" and the workout asked to pick it again.
    for (const c of db.customRows) {
      out[exKey(c.name)] = {
        name: c.title || c.name.charAt(0).toUpperCase() + c.name.slice(1),
        primary: parseMuscle(c.muscle),
        secondary: c.secondary.split(',').filter(Boolean).map(s => parseMuscle(s.trim())).filter(m => m !== 'OTHER')
      }
    }
    return out
  }, [db.customRows])

  const store = useMemo<Store>((): Store => {
    const now = () => Date.now()
    const active = db.sessions.find(s => s.finishedAt == null) ?? null
    const deleteSession = async (id: string): Promise<void> => {
        const t = now()
        const setIds = dbRef.current.sets.filter(x => x.sessionId === id).map(x => x.id)
        await write(
          d => ({ ...d, sessions: d.sessions.filter(x => x.id !== id), sets: d.sets.filter(x => x.sessionId !== id) }),
          async () => {
            await markDeleted('sets', setIds, t)
            await markDeleted('sessions', [id], t)
          }
        )
      }
    return {
      db, loading, error, userId, email, user, setUser, acting, openNotebook, custom, active,
      logged: db.sets.map(s => ({ weightGrams: s.weightGrams, reps: s.reps, implements: s.implements, kind: s.kind, exercise: s.exercise, createdAt: s.createdAt, rir: s.rir, goal: s.goal, sessionId: s.sessionId })),
      resolve: (name: string) => resolveExercise(name, custom),
      reload,
      startSession: async (title) => {
        if (dbRef.current.sessions.some(s => s.finishedAt == null)) return
        const s: Session = { id: uuid(), startedAt: now(), finishedAt: null, title, updatedAt: now() }
        track('workout_start', { title })
        await write(d => ({ ...d, sessions: [s, ...d.sessions] }), () => push('sessions', [toRow.session(s)]))
      },
      finishSession: async (endAt) => {
        const a = dbRef.current.sessions.find(s => s.finishedAt == null)
        if (!a) return
        if (!dbRef.current.sets.some(x => x.sessionId === a.id)) return deleteSession(a.id)
        const s = { ...a, finishedAt: Math.min(endAt ?? now(), now()), updatedAt: now() }
        track('workout_finish', { sets: dbRef.current.sets.filter(x => x.sessionId === a.id).length })
        await write(d => ({ ...d, sessions: d.sessions.map(x => (x.id === s.id ? s : x)) }), () => push('sessions', [toRow.session(s)]))
      },
      deleteSession,
      editSessionTimes: async (id, startedAt, finishedAt) => {
        await write(
          d => ({ ...d, sessions: d.sessions.map(x => (x.id === id ? { ...x, startedAt, finishedAt, updatedAt: now() } : x)).sort((a, b) => b.startedAt - a.startedAt) }),
          () => apiEditSessionTimes(id, startedAt, finishedAt)
        )
      },
      addSet: async (input) => {
        const a = dbRef.current.sessions.find(s => s.finishedAt == null)
        if (!a) return
        const s: WSet = { ...input, id: uuid(), sessionId: a.id, createdAt: now(), updatedAt: now() }
        await write(d => ({ ...d, sets: [...d.sets, s] }), () => push('sets', [toRow.set(s)]))
      },
      updateSet: async (input) => {
        const s = { ...input, updatedAt: now() }
        await write(d => ({ ...d, sets: d.sets.map(x => (x.id === s.id ? s : x)) }), () => push('sets', [toRow.set(s)]))
      },
      deleteSet: async (id) => {
        await write(d => ({ ...d, sets: d.sets.filter(x => x.id !== id) }), () => markDeleted('sets', [id], now()))
      },
      saveProfile: async (p) => {
        const v = { ...p, updatedAt: now() }
        await write(d => ({ ...d, profile: v }), () => push('profiles', [toRow.profile(v, userId)]))
      },
      saveMeasurement: async (m) => {
        const v = { ...m, updatedAt: now() }
        await write(
          d => ({ ...d, measurements: [...d.measurements.filter(x => x.id !== v.id), v].sort((a, b) => a.epochDay - b.epochDay) }),
          () => push('measurements', [toRow.measurement(v)])
        )
      },
      deleteMeasurement: async (id) => {
        await write(d => ({ ...d, measurements: d.measurements.filter(x => x.id !== id) }), () => markDeleted('measurements', [id], now()))
      },
      savePlanDay: async (p) => {
        const v = { ...p, updatedAt: now() }
        await write(
          d => ({ ...d, plan: [...d.plan.filter(x => x.dayOfWeek !== v.dayOfWeek), v].sort((a, b) => a.dayOfWeek - b.dayOfWeek) }),
          () => push('plan_days', [toRow.plan(v, userId)])
        )
      },
      deletePlanDay: async (day) => {
        await write(d => ({ ...d, plan: d.plan.filter(x => x.dayOfWeek !== day) }), () => markDeleted('plan_days', [String(day)], now()))
      },
      saveCustom: async (name, primary, secondary) => {
        if (!name.trim() || find(name) || primary === 'OTHER') return
        const v: CustomRow = { name: exKey(name), muscle: primary, title: name.trim(), secondary: secondary.filter(m => m !== primary).join(','), updatedAt: now() }
        await write(
          d => ({ ...d, customRows: [...d.customRows.filter(x => x.name !== v.name), v] }),
          () => push('custom_exercises', [toRow.custom(v, userId)])
        )
      },
      importBackup: async (json) => importBackupJson(json, reload),
      exportBackup: () => exportBackupJson(dbRef.current)
    }
  }, [db, loading, error, userId, email, user, setUser, acting, openNotebook, custom, reload, write])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** Same JSON format as the Android backup (format "irontrack-backup", version 1–3). */
export function exportBackupJson(db: Db): string {
  return JSON.stringify({
    format: 'irontrack-backup', version: 3, exportedAt: Date.now(),
    sessions: db.sessions.map(s => ({ id: s.id, startedAt: s.startedAt, finishedAt: s.finishedAt, title: s.title })),
    sets: db.sets.map(s => ({ id: s.id, sessionId: s.sessionId, exercise: s.exercise, weightGrams: s.weightGrams, reps: s.reps, rir: s.rir, kind: s.kind, createdAt: s.createdAt, implements: s.implements, goal: s.goal, targetReps: s.targetReps })),
    profile: { name: db.profile.name, birthYear: db.profile.birthYear, heightCm: db.profile.heightCm, sex: db.profile.sex, experienceYears: db.profile.experienceYears, goal: db.profile.goal, notes: db.profile.notes },
    measurements: db.measurements.map(m => ({ id: m.id, epochDay: m.epochDay, weightGrams: m.weightGrams, bodyFatPct: m.bodyFatPct, waistCm: m.waistCm, chestCm: m.chestCm, armCm: m.armCm })),
    plan: db.plan.map(p => ({ dayOfWeek: p.dayOfWeek, title: p.title, exercises: p.exercises, goals: p.goals })),
    customExercises: db.customRows.map(c => ({ name: c.name, muscle: c.muscle, title: c.title, secondary: c.secondary }))
  }, null, 2)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function importBackupJson(text: string, reload: () => Promise<void>): Promise<string> {
  let root: any
  try { root = JSON.parse(text) } catch { throw new Error('Файл не является JSON') }
  if (root.format !== 'irontrack-backup') throw new Error('Это не резервная копия IRONTRACK')
  if (!(root.version >= 1 && root.version <= 3)) throw new Error('Неподдерживаемая версия копии')
  const t = Date.now()
  const userId = ''
  const sessions = (root.sessions ?? []).map((s: any) => ({ id: s.id, user_id: userId, started_at: s.startedAt, finished_at: s.finishedAt ?? null, title: s.title ?? null, updated_at: t, deleted: false }))
  const ids = new Set(sessions.map((s: any) => s.id))
  const sets = (root.sets ?? []).map((s: any) => {
    if (!ids.has(s.sessionId)) throw new Error('Подходы ссылаются на несуществующую тренировку')
    return { id: s.id, user_id: userId, session_id: s.sessionId, exercise: s.exercise, weight_grams: s.weightGrams, reps: s.reps, rir: s.rir ?? null, kind: s.kind, created_at: s.createdAt, implements: s.implements ?? 1, goal: s.goal ?? null, target_reps: s.targetReps ?? null, updated_at: t, deleted: false }
  })
  const measurements = (root.measurements ?? []).map((m: any) => ({ id: m.id, user_id: userId, epoch_day: m.epochDay, weight_grams: m.weightGrams ?? null, body_fat_pct: m.bodyFatPct ?? null, waist_cm: m.waistCm ?? null, chest_cm: m.chestCm ?? null, arm_cm: m.armCm ?? null, updated_at: t, deleted: false }))
  const plan = (root.plan ?? []).map((p: any) => ({ user_id: userId, day_of_week: p.dayOfWeek, title: p.title, exercises: p.exercises, goals: p.goals ?? '', updated_at: t, deleted: false }))
  const custom = (root.customExercises ?? []).map((c: any) => ({ user_id: userId, name: c.name, muscle: c.muscle === 'LEGS' ? 'QUADS' : c.muscle, title: c.title ?? '', secondary: c.secondary ?? '', updated_at: t, deleted: false }))
  const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 500) }, (_, i) => a.slice(i * 500, i * 500 + 500))
  for (const [table, rows] of [
    ['sessions', sessions], ['sets', sets], ['measurements', measurements], ['plan_days', plan], ['custom_exercises', custom]
  ] as [string, any[]][]) {
    for (const c of chunks(rows)) await push(table, c)
  }
  if (root.profile) {
    const p = root.profile
    await push('profiles', [{ user_id: userId, name: p.name ?? '', birth_year: p.birthYear ?? null, height_cm: p.heightCm ?? null, sex: p.sex ?? null, experience_years: p.experienceYears ?? null, goal: p.goal ?? '', notes: p.notes ?? '', updated_at: t, deleted: false }])
  }
  await reload()
  return `Загружено: тренировок ${sessions.length}, подходов ${sets.length}, замеров ${measurements.length}`
}

export { planExercises }
